import { describe, expect, it } from 'vitest';

import { decodeWireFrames, parseScenario, planReplay, type PreparedRequest, type ReplayContext } from '../src/index.ts';
import { MemoryCorpus } from './support/fakes.ts';
import { fixtureRecording, prepareFixtureRequest } from './support/fixtures.ts';
import { anthropicRateLimited, anthropicText, anthropicToolResultFollowup, anthropicToolUseThinking, chatText, geminiSseText, responsesFunctionCall, responsesText } from '@flowmock/test-fixtures';

const corpus = new MemoryCorpus().add(
  fixtureRecording(anthropicText),
  fixtureRecording(anthropicToolUseThinking),
  fixtureRecording(anthropicRateLimited),
  fixtureRecording(chatText),
  fixtureRecording(responsesText),
  fixtureRecording(responsesFunctionCall),
  fixtureRecording(geminiSseText),
);

// Scenarios arrive as untyped YAML; parseScenario is the boundary under test.
const context = (scenario: unknown, overrides: Partial<ReplayContext> = {}): ReplayContext => ({
  scenario: parseScenario(scenario),
  callIndex: 1,
  seed: 'seed',
  nowMs: 1_800_000_000_000,
  scenarioElapsedMs: 0,
  inFlight: 1,
  ...overrides,
});

const bodyOf = (outcome: Awaited<ReturnType<typeof planReplay>>): string => {
  const decoder = new TextDecoder();
  return outcome.plan.writes.map(write => write.text ?? decoder.decode(write.bytes, { stream: true })).join('');
};

describe('planReplay', () => {
  it('replays the matching recording with rewritten ids and provenance', async () => {
    const outcome = await planReplay(prepareFixtureRequest(anthropicText), context({ name: 'plain' }), corpus);
    expect(outcome.trace).toMatchObject({ recordingId: 'rec_anthropic-text', selection: { mode: 'exact' }, error: null, fault: null });
    expect(outcome.plan.status).toBe(200);
    expect(bodyOf(outcome)).not.toContain('msg_01XFDUDYJgAACzvnptvVoYEL');
    expect(outcome.trace.provenance.map(entry => entry.transform)).toEqual(['rewrite', 'timing']);
    expect(outcome.trace.frames.some(frame => frame.origin === 'rewritten')).toBe(true);
  });

  it('injects a recorded 429 on the configured call', async () => {
    const scenario = { name: 'third-call-429', faults: [{ when: { callIndex: 3 }, inject: { type: 'http_error', from: { outcome: 'http_error:429' }, headers: { 'retry-after': '2' } } }] } as const;
    const second = await planReplay(prepareFixtureRequest(anthropicText), context(scenario, { callIndex: 2 }), corpus);
    expect(second.plan.status).toBe(200);
    const third = await planReplay(prepareFixtureRequest(anthropicText), context(scenario, { callIndex: 3 }), corpus);
    expect(third.plan.status).toBe(429);
    expect(third.plan.headers).toContainEqual(['retry-after', '2']);
    expect(third.trace).toMatchObject({ fault: { rule: 0, type: 'http_error' }, recordingId: 'rec_anthropic-429' });
    expect(JSON.parse(bodyOf(third))).toMatchObject({ error: { type: 'rate_limit_error' } });
  });

  it('answers with a protocol-shaped FlowMock error when nothing can be replayed', async () => {
    const outcome = await planReplay(prepareFixtureRequest(anthropicText, { body: { ...anthropicText.request.body, messages: [{ role: 'user', content: 'unseen' }] } }), context({ name: 'strict', selection: { mode: 'match' } }), corpus);
    expect(outcome.plan.status).toBe(404);
    expect(outcome.plan.headers).toContainEqual(['x-flowmock-error', 'no_recording']);
    expect(JSON.parse(bodyOf(outcome))).toMatchObject({ type: 'error', error: { type: 'flowmock_no_recording' } });
    expect(outcome.trace.error?.code).toBe('no_recording');
  });

  it('injects an inline stream error event', async () => {
    const outcome = await planReplay(prepareFixtureRequest(anthropicText), context({
      name: 'overloaded',
      faults: [{ inject: { type: 'stream_error_event', at: { fraction: 0.5 }, event: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } } }],
    }), corpus);
    expect(bodyOf(outcome)).toMatch(/event: error\ndata: \{"type":"error","error":\{"type":"overloaded_error","message":"Overloaded"\}\}\n\n$/);
  });

  it('reports a missing error sample instead of inventing one', async () => {
    const outcome = await planReplay(prepareFixtureRequest(chatText), context({ name: 'needs-sample', faults: [{ inject: { type: 'stream_error_event' } }] }), corpus);
    expect(outcome.trace.error?.code).toBe('no_error_sample');
    expect(outcome.plan.status).toBe(500);
  });

  it('falls back to scenario overrides for an HTTP error without a sample', async () => {
    const outcome = await planReplay(prepareFixtureRequest(chatText), context({ name: 'override', faults: [{ inject: { type: 'http_error', status: 503 } }] }), corpus);
    expect(outcome.plan.status).toBe(503);
    expect(JSON.parse(bodyOf(outcome))).toMatchObject({ error: { type: 'overloaded_error' } });
  });

  it('only reuses a recorded error body whose status matches an explicit status', async () => {
    const outcome = await planReplay(prepareFixtureRequest(anthropicText), context({ name: 'status-503', faults: [{ inject: { type: 'http_error', status: 503 } }] }), corpus);
    expect(outcome.plan.status).toBe(503);
    expect(outcome.trace.recordingId).toBeNull();
    expect(JSON.parse(bodyOf(outcome))).toMatchObject({ type: 'error', error: { type: 'overloaded_error' } });
  });

  it('applies a concurrency limit only above the in-flight threshold', async () => {
    const scenario = { name: 'limit', faults: [{ inject: { type: 'concurrency_limit', max: 2 } }] } as const;
    expect((await planReplay(prepareFixtureRequest(anthropicText), context(scenario, { inFlight: 2 }), corpus)).plan.status).toBe(200);
    const limited = await planReplay(prepareFixtureRequest(anthropicText), context(scenario, { inFlight: 3 }), corpus);
    expect(limited.plan.status).toBe(429);
    expect(limited.trace.recordingId).toBe('rec_anthropic-429');
  });

  it('serves a WebSocket Responses turn from an SSE recording and remembers the conversation', async () => {
    const request = prepareFixtureRequest(responsesFunctionCall, { transport: 'ws' });
    const outcome = await planReplay(request, context({ name: 'ws' }), corpus);
    expect(outcome.plan.transport).toBe('ws');
    expect(outcome.plan.writes.every(write => write.text !== undefined && !write.text.startsWith('event:'))).toBe(true);
    expect(outcome.conversation?.responseId).toMatch(/^resp_[0-9a-f]+$/);
    expect(outcome.conversation?.responseId).not.toBe('resp_68e0f00dfacecafe0123456789abcdef0123456789abcdef');
    expect(outcome.conversation?.items.map(item => (item as { type?: string; role?: string }).type ?? (item as { role: string }).role)).toEqual(['message', 'reasoning', 'function_call']);
  });

  it('serves Gemini JSON array streams from SSE recordings', async () => {
    const request: PreparedRequest = { ...prepareFixtureRequest(geminiSseText), wire: 'json-array' };
    const outcome = await planReplay(request, context({ name: 'array' }), corpus);
    const body = bodyOf(outcome);
    expect(body.startsWith('[{')).toBe(true);
    expect(body.endsWith('\n]')).toBe(true);
    const frames = decodeWireFrames('json-array', [{ t: 0, bytes: new TextEncoder().encode(body) }]);
    expect(frames.filter(frame => frame.kind === 'json-element')).toHaveLength(4);
  });

  it('collects a streamed recording for a non-streaming request', async () => {
    const outcome = await planReplay(prepareFixtureRequest(anthropicText, { body: { ...anthropicText.request.body, stream: false } }), context({ name: 'collect' }), corpus);
    expect(outcome.plan.headers).toContainEqual(['content-type', 'application/json']);
    expect(JSON.parse(bodyOf(outcome))).toMatchObject({ type: 'message', content: [{ type: 'text', text: 'Hello! How can I help you today?' }], usage: { output_tokens: 12 } });
  });

  it('continues a conversation by prefix in match mode', async () => {
    const outcome = await planReplay(prepareFixtureRequest(anthropicToolResultFollowup), context({ name: 'prefix', selection: { mode: 'match' } }), corpus);
    expect(outcome.trace.selection).toMatchObject({ mode: 'prefix' });
  });

  it('plans identically for the same seed', async () => {
    const scenario = { name: 'noisy', timing: { mode: 'synthetic', ttftMs: { dist: 'lognormal', p50: 800, p95: 3000 }, tps: { dist: 'normal', mean: 60, sd: 10 } }, network: { jitterMs: 20, fragmentation: { maxBytes: 9 } } } as const;
    const first = await planReplay(prepareFixtureRequest(anthropicText), context(scenario), corpus);
    const second = await planReplay(prepareFixtureRequest(anthropicText), context(scenario), corpus);
    expect(second.plan.writes.map(write => write.at)).toEqual(first.plan.writes.map(write => write.at));
    expect(bodyOf(second)).toBe(bodyOf(first));
  });
});
