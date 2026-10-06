import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { matchesFilters, type RequestSummary } from '../../../src/components/requests/summary.ts';
import * as requests from '../../../src/routes/requests.tsx';
import { useAuthStore } from '../../../src/stores/auth-store.ts';
import { renderInApp } from '../../render.tsx';

class FakeSource {
  static opened: FakeSource[] = [];
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  constructor(url: string) { this.url = url; FakeSource.opened.push(this); }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  close() { this.closed = true; }
  emit(type: string, data = '') { for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data })); }
}

const entry = (id: string, patch: Record<string, unknown> = {}) => ({
  id, startedAt: Date.UTC(2026, 9, 7, 7, 0), mode: 'replay', keyName: 'demo chaos', protocol: 'anthropic-messages', transport: 'http', method: 'POST', path: '/v1/messages',
  model: 'claude-sonnet-4-5', status: 200, durationMs: 900, recordingId: 'rec_1', cassetteId: null,
  trace: { fault: null }, result: { achievedTtftMs: 450, achievedTps: 80 }, expected: null, outcome: 'completed', error: null, ...patch,
});
const summary = (id: string, patch: Partial<RequestSummary> = {}): RequestSummary => ({
  id, startedAt: Date.UTC(2026, 9, 7, 7, 1), mode: 'replay', keyName: 'demo chaos', protocol: 'anthropic-messages', transport: 'http', model: 'claude-haiku-4-5', status: 429,
  durationMs: 90, outcome: 'completed', recordingId: null, achievedTtftMs: null, achievedTps: null, fault: 'http_error', ...patch,
});

let queries: string[] = [];
const fakeServer = async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(String(input), 'http://flowmock.test');
  if (url.pathname === '/api/auth/me') return Response.json({ via: 'open' });
  if (url.pathname === '/api/keys') return Response.json({ items: [{ key: 'fm-chaos-0001', name: 'demo chaos' }] });
  if (url.pathname === '/api/requests') {
    queries.push(url.search);
    return Response.json({ items: [entry('req_old', { trace: { fault: { rule: 0, type: 'interrupt' } }, outcome: 'interrupted' })] });
  }
  return new Response(null, { status: 404 });
};

const renderRequests = (entry = '/requests') => {
  const router = createMemoryRouter([{ path: '/requests', loader: requests.clientLoader, Component: requests.default }], { initialEntries: [entry] });
  renderInApp(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => {
  queries = [];
  FakeSource.opened = [];
  useAuthStore.getState().clear();
  vi.stubGlobal('fetch', vi.fn(fakeServer));
  vi.stubGlobal('EventSource', FakeSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('the request filters', () => {
  it('hold a streamed request to the filters the page was fetched with', () => {
    const none = { mode: '', key: '', protocol: '', status: '', outcome: '' };
    expect(matchesFilters(summary('a'), none)).toBe(true);
    expect(matchesFilters(summary('a'), { ...none, status: '4xx' })).toBe(true);
    expect(matchesFilters(summary('a'), { ...none, status: '5xx' })).toBe(false);
    expect(matchesFilters(summary('a', { status: null }), { ...none, status: '2xx' })).toBe(false);
    expect(matchesFilters(summary('a'), { ...none, mode: 'record' })).toBe(false);
    expect(matchesFilters(summary('a'), { ...none, key: 'demo chaos', protocol: 'anthropic-messages', outcome: 'completed' })).toBe(true);
  });
});

describe('the requests page', () => {
  it('lists a fetched page and adds what the stream sends above it', async () => {
    renderRequests();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Interrupted connection')).toBeTruthy();
    expect(within(table).getByText('interrupted')).toBeTruthy();
    expect(FakeSource.opened.at(-1)!.url).toBe('/api/requests/stream');
    act(() => FakeSource.opened.at(-1)!.emit('request', JSON.stringify(summary('req_new'))));
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('claude-haiku-4-5')).toBeTruthy();
    expect(within(rows[1]!).getByText('429')).toBeTruthy();
    expect(within(rows[2]!).getByText('claude-sonnet-4-5')).toBeTruthy();
    // One that started earlier but ended later takes its place by start.
    act(() => FakeSource.opened.at(-1)!.emit('request', JSON.stringify(summary('req_long', { startedAt: Date.UTC(2026, 9, 7, 6, 59), model: 'claude-opus-4-1' }))));
    expect(within(within(table).getAllByRole('row').at(-1)!).getByText('claude-opus-4-1')).toBeTruthy();
  });

  it('fetches with the filters in the address and leaves out streamed requests they exclude', async () => {
    renderRequests('/requests?mode=record&status=5xx');
    await screen.findByRole('table');
    expect(queries).toEqual(['?limit=100&mode=record&status=5xx']);
    act(() => FakeSource.opened.at(-1)!.emit('request', JSON.stringify(summary('req_replay'))));
    expect(screen.queryByText('claude-haiku-4-5')).toBeNull();
  });

  it('closes the stream while paused and reloads the page on resuming', async () => {
    renderRequests();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(FakeSource.opened.at(-1)!.closed).toBe(true);
    expect(screen.getByText('Paused')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(FakeSource.opened.at(-1)!.closed).toBe(false);
  });
});
