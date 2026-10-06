import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ADMIN_KEY, startTestServer, type TestServer } from '../support/flowmock.ts';

let flowmock: TestServer;
beforeEach(async () => { flowmock = await startTestServer(); });
afterEach(async () => { await flowmock.stop(); });

const post = (body: unknown) => fetch(`${flowmock.url}/api/targets`, {
  method: 'POST',
  headers: { authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('recording targets', () => {
  it('answers with masked secrets and stores them whole', async () => {
    const response = await post({ id: 'anthropic', baseUrl: 'https://api.anthropic.com', headers: { 'x-api-key': 'sk-ant-secret-0123456789' } });
    expect(response.status).toBe(201);
    expect((await response.json() as { headers: Record<string, string> }).headers['x-api-key']).toBe('sk-a••••6789');
    expect(flowmock.services.config.getTarget('anthropic')!.headers['x-api-key']).toBe('sk-ant-secret-0123456789');
  });

  it('keeps a stored header the edit leaves as null, so a secret need not be re-entered', async () => {
    await post({ id: 'anthropic', baseUrl: 'https://api.anthropic.com', headers: { 'x-api-key': 'sk-ant-secret-0123456789', 'anthropic-beta': 'old' } });
    const response = await post({ id: 'anthropic', name: 'Anthropic', baseUrl: 'https://proxy.example.com', headers: { 'x-api-key': null, 'anthropic-beta': 'new' } });
    expect(response.status).toBe(201);
    expect(flowmock.services.config.getTarget('anthropic')).toMatchObject({
      name: 'Anthropic',
      baseUrl: 'https://proxy.example.com',
      headers: { 'x-api-key': 'sk-ant-secret-0123456789', 'anthropic-beta': 'new' },
    });
  });

  it('refuses to keep a header there is no stored value for', async () => {
    const response = await post({ id: 'fresh', baseUrl: 'https://api.openai.com', headers: { authorization: null } });
    expect(response.status).toBe(400);
    expect(flowmock.services.config.getTarget('fresh')).toBeNull();
  });
});
