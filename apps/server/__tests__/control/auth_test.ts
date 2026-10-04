import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ADMIN_KEY, startTestServer, type TestServer } from '../support/flowmock.ts';

let flowmock: TestServer;
beforeEach(async () => { flowmock = await startTestServer(); });
afterEach(async () => { await flowmock.stop(); });

const login = (key: string) => fetch(`${flowmock.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });

describe('admin sessions', () => {
  it('issues local development sessions without a configured admin key', async () => {
    flowmock.services.adminKey = null;
    expect(await (await fetch(`${flowmock.url}/api/auth/me`)).json()).toEqual({ via: 'open' });
    const response = await login('local-development');
    expect(response.status).toBe(201);
    const { token } = await response.json() as { token: string };
    expect(await (await fetch(`${flowmock.url}/api/auth/me`, { headers: { 'x-flowmock-admin-session': token } })).json()).toEqual({ via: 'session' });
  });
  it('exchanges the key, keeps only a hash and authenticates the control plane and metrics', async () => {
    const response = await login(ADMIN_KEY);
    expect(response.status).toBe(201);
    const { token, expiresAt } = await response.json() as { token: string; expiresAt: number };
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(JSON.stringify(flowmock.services.db.prepare('SELECT * FROM admin_sessions').all())).not.toContain(token);
    const headers = { 'x-flowmock-admin-session': token };
    expect(await (await fetch(`${flowmock.url}/api/auth/me`, { headers })).json()).toEqual({ via: 'session' });
    expect((await fetch(`${flowmock.url}/api/scenarios`, { headers })).status).toBe(200);
    expect((await fetch(`${flowmock.url}/metrics`, { headers })).status).toBe(200);
    expect(await (await flowmock.admin('/auth/me')).json()).toEqual({ via: 'admin-key' });
    expect((await fetch(`${flowmock.url}/api/health`)).status).toBe(200);
  });

  it('rejects bad input, throttles failures and resets on a valid login', async () => {
    expect((await login('')).status).toBe(400);
    for (let attempt = 0; attempt < 10; attempt++) expect((await login('wrong')).status).toBe(401);
    expect((await login('wrong')).status).toBe(429);
    expect((await login(ADMIN_KEY)).status).toBe(201);
    expect((await login('wrong')).status).toBe(401);
  });

  it('revokes sessions and keeps data-plane and query credentials isolated', async () => {
    const { token } = await (await login(ADMIN_KEY)).json() as { token: string };
    expect((await fetch(`${flowmock.url}/api/scenarios`, { headers: { 'x-flowmock-session': token } })).status).toBe(401);
    expect((await fetch(`${flowmock.url}/api/scenarios?session=${token}`)).status).toBe(401);
    expect((await fetch(`${flowmock.url}/api/requests/x?session=${token}`)).status).toBe(401);
    expect((await fetch(`${flowmock.url}/api/auth/session`, { method: 'DELETE', headers: { 'x-flowmock-admin-session': token } })).status).toBe(204);
    expect((await fetch(`${flowmock.url}/api/scenarios`, { headers: { 'x-flowmock-admin-session': token } })).status).toBe(401);
  });
});
