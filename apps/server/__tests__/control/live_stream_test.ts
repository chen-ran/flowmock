import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ADMIN_KEY, startTestServer, type TestServer } from '../support/flowmock.ts';
import { seedFixture } from '../support/seed.ts';
import { anthropicText } from '@flowmock/test-fixtures';

let flowmock: TestServer;
beforeEach(async () => {
  flowmock = await startTestServer();
  await seedFixture(flowmock.services, anthropicText);
  flowmock.services.config.upsertKey({ key: 'fm-live-test', replay: 'default' });
});
afterEach(async () => { await flowmock.stop(); });

const replay = async () => {
  const response = await fetch(`${flowmock.url}/v1/messages`, { method: 'POST', headers: { authorization: 'Bearer fm-live-test', 'content-type': 'application/json' }, body: JSON.stringify(anthropicText.request.body) });
  await response.text();
  return response.headers.get('x-flowmock-request-id');
};

describe('live SSE', () => {
  it('publishes metrics immediately and updates after a replay', async () => {
    const abort = new AbortController();
    try {
      const response = await fetch(`${flowmock.url}/api/live`, { headers: { authorization: `Bearer ${ADMIN_KEY}` }, signal: abort.signal });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: snapshot');
      await replay();
      let next = '';
      for (let attempt = 0; attempt < 4 && !next.includes('"requestsPerSecond":0.1'); attempt++) next = new TextDecoder().decode((await reader.read()).value);
      expect(next).toContain('"requestsPerSecond":0.1');
      expect(next).toContain('"anthropic-messages":{"requests":1,"errors":0}');
    } finally { abort.abort(); }
  });

  it('accepts query sessions only on SSE GETs, emits summaries and removes disconnected listeners', async () => {
    const login = await fetch(`${flowmock.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: ADMIN_KEY }) });
    const { token } = await login.json() as { token: string };
    const baseline = flowmock.services.timeline.listenerCount;
    const abort = new AbortController();
    try {
      const response = await fetch(`${flowmock.url}/api/requests/stream?session=${token}`, { signal: abort.signal });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      await reader.read();
      expect(flowmock.services.timeline.listenerCount).toBe(baseline + 1);
      const id = await replay();
      const text = new TextDecoder().decode((await reader.read()).value);
      expect(text).toContain('event: request');
      const data = JSON.parse(text.split('data: ')[1].split('\n')[0]) as Record<string, unknown>;
      expect(data.id).toBe(id);
      expect(data).toMatchObject({ model: expect.any(String), durationMs: expect.any(Number) });
      expect(data).not.toHaveProperty('trace');
      expect(data).not.toHaveProperty('path');
    } finally { abort.abort(); }
    await expect.poll(() => flowmock.services.timeline.listenerCount).toBe(baseline);
    expect((await fetch(`${flowmock.url}/api/live?session=${token}`, { method: 'POST' })).status).toBe(401);
  });
});
