import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { ADMIN_KEY, readTimed, startTestServer, type TestServer } from './support/flowmock.ts';
import { seedFixture } from './support/seed.ts';
import { anthropicOverloadedMidStream, anthropicRateLimited, anthropicText, chatText } from '@flowmock/test-fixtures';

let flowmock: TestServer;

// One key per scenario keeps call counters independent between tests.
const useScenario = (key: string, scenario: Record<string, unknown>): string => {
  flowmock.services.config.upsertScenario(stringify(scenario));
  flowmock.services.config.upsertKey({ key, replay: scenario.name as string });
  return key;
};

const anthropicRequest = (key: string, body: Record<string, unknown> = anthropicText.request.body, headers: Record<string, string> = {}) => fetch(`${flowmock.url}/v1/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, ...headers },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  flowmock = await startTestServer();
  for (const fixture of [anthropicText, anthropicOverloadedMidStream, anthropicRateLimited, chatText]) await seedFixture(flowmock.services, fixture);
});

afterAll(async () => {
  await flowmock.stop();
});

describe('connection faults on real sockets', () => {
  const interrupt = (mode: string, extra: Record<string, unknown> = {}) => ({
    name: `interrupt-${mode}`,
    timing: { mode: 'recorded', scale: 0.05 },
    faults: [{ inject: { type: 'interrupt', at: { fraction: 0.5 }, mode, ...extra } }],
  });

  it('resets the connection mid-stream', async () => {
    const response = await anthropicRequest(useScenario('fm-fault-reset', interrupt('reset')));
    expect(response.status).toBe(200);
    const { text, error } = await readTimed(response);
    expect(error).not.toBeNull();
    expect(text).toContain('content_block_delta');
    expect(text).not.toContain('message_stop');
  });

  it('closes the connection mid-body without finishing the HTTP response', async () => {
    const { text, error } = await readTimed(await anthropicRequest(useScenario('fm-fault-abort', interrupt('abort'))));
    expect(error).not.toBeNull();
    expect(text).not.toContain('message_stop');
  });

  it('finishes the HTTP response cleanly but early', async () => {
    const { text, error } = await readTimed(await anthropicRequest(useScenario('fm-fault-fin', interrupt('fin'))));
    expect(error).toBeNull();
    expect(text).toContain('" can I"');
    expect(text).not.toContain('message_stop');
  });

  it('hangs without writing until hangMs, then drops the connection', async () => {
    const started = performance.now();
    const { text, error, reads } = await readTimed(await anthropicRequest(useScenario('fm-fault-hang', interrupt('hang', { hangMs: 400 }))));
    expect(error).not.toBeNull();
    expect(performance.now() - started).toBeGreaterThanOrEqual(380);
    expect(reads.at(-1)!.at).toBeLessThan(250);
    expect(text).not.toContain('message_stop');
  });

  it('surfaces a reset as a connection error in the OpenAI SDK', async () => {
    const key = useScenario('fm-fault-chat-reset', { name: 'chat-reset', faults: [{ inject: { type: 'interrupt', at: { fraction: 0.3 }, mode: 'reset' } }], timing: { mode: 'recorded', scale: 0.05 } });
    const client = new OpenAI({ apiKey: key, baseURL: `${flowmock.url}/v1`, maxRetries: 0 });
    const consume = async () => {
      const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', stream: true, messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hello!' }] });
      for await (const _chunk of stream) { /* drain */ }
    };
    await expect(consume()).rejects.toThrow();
  });
});

describe('protocol faults', () => {
  it('replays a recorded 429 on the third call of a session', async () => {
    const key = useScenario('fm-fault-third', {
      name: 'third-call-429',
      faults: [{ when: { callIndex: 3 }, inject: { type: 'http_error', from: { outcome: 'http_error:429' }, headers: { 'retry-after': '2' } } }],
    });
    const client = new Anthropic({ apiKey: key, baseURL: flowmock.url, maxRetries: 0, defaultHeaders: { 'x-flowmock-session': 'third-call' } });
    const call = async () => await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 1024, messages: [{ role: 'user', content: 'Say hello' }] });
    await call();
    await call();
    const error = await call().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Anthropic.RateLimitError);
    expect((error as InstanceType<typeof Anthropic.RateLimitError>).headers?.get('retry-after')).toBe('2');
    expect((error as InstanceType<typeof Anthropic.RateLimitError>).message).toContain('rate_limit_error');
    await call();
  });

  it('injects a recorded overloaded_error event into a stream', async () => {
    const key = useScenario('fm-fault-overload', {
      name: 'overload-midway',
      timing: { mode: 'recorded', scale: 0.05 },
      faults: [{ inject: { type: 'stream_error_event', at: { fraction: 0.5 }, from: { outcome: 'stream_error:overloaded_error' } } }],
    });
    const client = new Anthropic({ apiKey: key, baseURL: flowmock.url, maxRetries: 0 });
    const stream = client.messages.stream({ model: 'claude-sonnet-4-5', max_tokens: 1024, messages: [{ role: 'user', content: 'Say hello' }] });
    await expect(stream.finalMessage()).rejects.toThrow(/overloaded_error/);
  });

  it('limits concurrent requests per key with a recorded 429', async () => {
    const key = useScenario('fm-fault-concurrency', {
      name: 'one-at-a-time',
      timing: { mode: 'synthetic', ttftMs: 400, tps: 200 },
      faults: [{ inject: { type: 'concurrency_limit', max: 1 } }],
    });
    const [first, second] = await Promise.all([anthropicRequest(key), (async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return await anthropicRequest(key);
    })()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await first.text();
    expect((await anthropicRequest(key)).status).toBe(200);
  });

  it('fails every call inside a time window', async () => {
    const key = useScenario('fm-fault-window', {
      name: 'outage',
      faults: [{ when: { window: { startMs: 0, endMs: 60_000 } }, inject: { type: 'http_error', status: 503, headers: { 'retry-after': '30' } } }],
    });
    const response = await anthropicRequest(key);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(await response.json()).toMatchObject({ type: 'error', error: { type: 'overloaded_error' } });
  });

  it('selects a scenario with model@scenario when the client cannot send headers', async () => {
    useScenario('fm-fault-unused', { name: 'suffix-outage', faults: [{ inject: { type: 'http_error', status: 529 } }] });
    flowmock.services.config.upsertKey({ key: 'fm-plain-default', replay: 'default' });
    const ok = await anthropicRequest('fm-plain-default');
    expect(ok.status).toBe(200);
    await ok.text();
    const overridden = await anthropicRequest('fm-plain-default', { ...anthropicText.request.body, model: 'claude-sonnet-4-5@suffix-outage' });
    expect(overridden.status).toBe(529);
    const header = await anthropicRequest('fm-plain-default', anthropicText.request.body, { 'x-flowmock-scenario': 'suffix-outage' });
    expect(header.status).toBe(529);
  });

  it('records each injected fault in metrics', async () => {
    const metrics = await (await fetch(`${flowmock.url}/metrics`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } })).text();
    expect(metrics).toMatch(/flowmock_faults_total\{type="http_error"\} \d+/);
    expect(metrics).toMatch(/flowmock_faults_total\{type="interrupt"\} \d+/);
    expect(metrics).toMatch(/flowmock_faults_total\{type="concurrency_limit"\} 1/);
  });
});
