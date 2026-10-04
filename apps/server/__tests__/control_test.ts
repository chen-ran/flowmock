import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestServer, type TestServer } from './support/flowmock.ts';
import { seedFixture } from './support/seed.ts';
import { anthropicText, chatText, fixtureBodyText } from '@flowmock/test-fixtures';

let flowmock: TestServer;

beforeAll(async () => {
  flowmock = await startTestServer();
  await seedFixture(flowmock.services, anthropicText);
  await seedFixture(flowmock.services, chatText);
});

afterAll(async () => {
  await flowmock.stop();
});

const SCENARIO_YAML = `name: flaky
description: one in three calls fails
timing: { mode: synthetic, ttftMs: { dist: lognormal, p50: 800, p95: 3000 }, tps: { dist: normal, mean: 60, sd: 10 } }
faults:
  - when: { everyN: 3 }
    inject: { type: http_error, status: 529 }
`;

describe('admin API', () => {
  it('requires the admin key', async () => {
    expect((await fetch(`${flowmock.url}/api/scenarios`)).status).toBe(401);
    expect((await fetch(`${flowmock.url}/api/scenarios`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await flowmock.admin('/scenarios')).status).toBe(200);
  });

  it('stores scenarios from YAML and rejects invalid ones with the reason', async () => {
    const created = await flowmock.admin('/scenarios/flaky', { method: 'PUT', body: SCENARIO_YAML, headers: { 'content-type': 'application/yaml' } });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ name: 'flaky', builtIn: false, scenario: { faults: [{ when: { everyN: 3 }, inject: { type: 'http_error', status: 529 } }] } });

    const invalid = await flowmock.admin('/scenarios/broken', { method: 'PUT', body: 'name: broken\ntiming: { mode: synthetic }\n' });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { message: string } }).error.message).toContain('ttftMs');

    const mismatch = await flowmock.admin('/scenarios/other', { method: 'PUT', body: SCENARIO_YAML });
    expect(mismatch.status).toBe(400);

    const list = await (await flowmock.admin('/scenarios')).json() as { items: Array<{ name: string; builtIn: boolean }> };
    expect(list.items.map(item => [item.name, item.builtIn])).toEqual([['default', true], ['flaky', false]]);
  });

  it('binds keys to scenarios and targets and refuses dangling or in-use references', async () => {
    expect((await flowmock.admin('/keys', { method: 'POST', body: JSON.stringify({ key: 'fm-flaky-key', replay: 'flaky' }) })).status).toBe(201);
    expect((await flowmock.admin('/keys', { method: 'POST', body: JSON.stringify({ key: 'fm-missing', replay: 'nope' }) })).status).toBe(404);
    expect((await flowmock.admin('/keys', { method: 'POST', body: JSON.stringify({ key: 'short', replay: 'flaky' }) })).status).toBe(400);
    expect((await flowmock.admin('/scenarios/flaky', { method: 'DELETE' })).status).toBe(409);

    const target = await flowmock.admin('/targets', { method: 'POST', body: JSON.stringify({ id: 'anthropic', baseUrl: 'https://api.anthropic.com/', headers: { 'x-api-key': 'sk-ant-very-secret-value' } }) });
    expect(target.status).toBe(201);
    expect(await target.json()).toMatchObject({ baseUrl: 'https://api.anthropic.com', headers: { 'x-api-key': 'sk-a••••alue' } });
  });

  it('previews a plan without sending anything', async () => {
    const preview = await flowmock.admin('/scenarios/flaky/preview', {
      method: 'POST',
      body: JSON.stringify({ protocol: 'anthropic-messages', body: anthropicText.request.body, seed: 'fixed', callIndex: 1 }),
    });
    const { trace, plan } = await preview.json() as { trace: { recordingId: string; selection: { mode: string } }; plan: { status: number; expected: { ttftMs: number; tps: number }; writes: Array<{ at: number; text: string }> } };
    expect(trace.selection.mode).toBe('exact');
    expect(plan.status).toBe(200);
    expect(plan.expected.ttftMs).toBeGreaterThan(0);
    expect(plan.writes.map(write => write.text).join('')).toContain('text_delta');

    const third = await (await flowmock.admin('/scenarios/flaky/preview', {
      method: 'POST',
      body: JSON.stringify({ protocol: 'anthropic-messages', body: anthropicText.request.body, seed: 'fixed', callIndex: 3 }),
    })).json() as { plan: { status: number }; trace: { fault: { type: string } } };
    expect(third.plan.status).toBe(529);
    expect(third.trace.fault.type).toBe('http_error');
  });

  it('exports the corpus and imports it into another server', async () => {
    const exported = await (await flowmock.admin('/export')).text();
    expect(exported.trim().split('\n')).toHaveLength(2);

    const other = await startTestServer();
    try {
      const imported = await (await other.admin('/import', { method: 'POST', body: exported })).json();
      expect(imported).toEqual({ cassettes: 0, recordings: 2, skipped: 0 });
      expect(await (await other.admin('/import', { method: 'POST', body: exported })).json()).toEqual({ cassettes: 0, recordings: 0, skipped: 2 });
      other.services.config.upsertKey({ key: 'fm-imported', replay: 'default' });
      const response = await fetch(`${other.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer fm-imported' },
        body: JSON.stringify(chatText.request.body),
      });
      expect((await response.text()).split('\n').length).toBe(fixtureBodyText(chatText).split('\n').length);
    } finally {
      await other.stop();
    }
  });

  it('serves recording details, raw bodies and deletion', async () => {
    const { items } = await (await flowmock.admin('/recordings?protocol=openai-chat-completions')).json() as { items: Array<{ id: string }> };
    const body = await (await flowmock.admin(`/recordings/${items[0].id}/body`)).text();
    expect(body).toBe(fixtureBodyText(chatText));
    expect((await flowmock.admin(`/recordings/${items[0].id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await flowmock.admin(`/recordings/${items[0].id}`)).status).toBe(404);
  });

  it('publishes the scenario JSON Schema and the transform registry', async () => {
    const schema = await (await flowmock.admin('/schema/scenario')).json() as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['selection', 'timing', 'network', 'faults', 'transforms']));
    const transforms = await (await flowmock.admin('/transforms')).json() as { items: Array<{ type: string; stage: string }> };
    expect(transforms.items.map(item => item.type)).toEqual(expect.arrayContaining(['rewrite', 'timing', 'interrupt', 'network']));
  });
});
