// Adapted from Floway apps/web/__tests__/api/client_test.ts (MIT). See NOTICE.md.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFetch, callApi, callApiNoContent } from '../../src/api/client.ts';
import { flowmockSessionHeader, getSessionToken, setSessionToken } from '../../src/auth/session.ts';
import { isAbortError } from '../../src/lib/error-message.ts';

const respond = (response: Response) => () => Promise.resolve(response);

describe('callApi', () => {
  it('parses a JSON body on a 2xx', async () => {
    const result = await callApi(respond(Response.json({ token: 't' }, { status: 201 })));
    expect(result).toEqual({ data: { token: 't' } });
  });

  it('surfaces the server error message from a failed response', async () => {
    const body = { error: { code: 'not_found', message: 'recording not found' } };
    const result = await callApi(respond(Response.json(body, { status: 404 })));
    expect(result.error).toEqual({ status: 404, message: 'recording not found', raw: body });
  });

  it('falls back to the status line when the failure carries no JSON body', async () => {
    const result = await callApi(respond(new Response(null, { status: 502 })));
    expect(result.error).toMatchObject({ status: 502, message: 'HTTP 502' });
  });

  it('reports a malformed body on a status that promised one', async () => {
    const result = await callApi(respond(new Response('not json', { status: 200 })));
    expect(result.data).toBeUndefined();
    expect(result.error?.status).toBe(200);
  });

  it('takes a body-less 204 as success only through callApiNoContent', async () => {
    expect((await callApi(respond(new Response(null, { status: 204 })))).error?.status).toBe(204);
    expect(await callApiNoContent(respond(new Response(null, { status: 204 })))).toEqual({ data: undefined });
  });

  it('reports a transport failure as status 0 and keeps what was thrown', async () => {
    const thrown = new Error('network down');
    expect((await callApi(() => Promise.reject(thrown))).error).toEqual({ status: 0, message: 'network down', cause: thrown });
    const aborted = await callApi(() => Promise.reject(AbortSignal.abort().reason));
    expect(isAbortError(aborted.error?.cause)).toBe(true);
  });
});

describe('authFetch', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetch.mockReset();
  });

  it('sends the stored admin session, never the data plane session header', async () => {
    setSessionToken('session-token');
    fetch.mockResolvedValue(Response.json({ via: 'session' }));
    await authFetch('/api/auth/me');
    const headers = new Headers(fetch.mock.calls[0]![1]!.headers);
    expect(headers.get(flowmockSessionHeader)).toBe('session-token');
    expect(headers.has('x-flowmock-session')).toBe(false);
  });

  it('clears the session a 401 answered for, and only that one', async () => {
    setSessionToken('stale');
    fetch.mockImplementation(async () => {
      setSessionToken('fresh');
      return new Response(null, { status: 401 });
    });
    await authFetch('/api/scenarios');
    expect(getSessionToken()).toBe('fresh');

    fetch.mockResolvedValue(new Response(null, { status: 401 }));
    await authFetch('/api/scenarios');
    expect(getSessionToken()).toBeNull();
  });
});
