import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as corpus from '../../../src/routes/corpus.tsx';
import { useAuthStore } from '../../../src/stores/auth-store.ts';
import { renderInApp } from '../../render.tsx';
import { OutcomeToastProvider } from '@flowmock/ui/controls/outcome-toast.tsx';

const recording = (id: string, outcome = 'ok') => ({
  id, createdAt: Date.UTC(2026, 9, 5, 9), protocol: 'anthropic-messages', transport: 'http', model: `model-${id}`, status: 200, wire: 'sse',
  features: { stream: true, outcome, stopReason: 'end_turn', inputTokens: 10, outputTokens: 20, toolCalls: 0, toolNames: [], reasoning: false, hasTools: false, requestToolNames: [], reasoningRequested: false, inputChars: 40, ttftMs: 320, tps: 41.2, durationMs: 900, responseModel: null, frames: 8, bytes: 900 },
  fingerprint: 'f', prefixHashes: [], sessionId: null, cassetteId: null, cassetteSeq: null,
});

let requests: URL[] = [];
const fakeServer = async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(String(input), 'http://flowmock.test');
  if (url.pathname === '/api/auth/me') return Response.json({ via: 'open' });
  if (url.pathname === '/api/recordings') {
    requests.push(url);
    const failed = url.searchParams.get('outcome') === 'http_error:*';
    return Response.json({ total: 3, items: failed ? [recording('r3', 'http_error:529')] : [recording('r1'), recording('r2')] });
  }
  return new Response(null, { status: 404 });
};

const renderCorpus = (path = '/corpus') => {
  const router = createMemoryRouter([{ path: '/corpus', loader: corpus.clientLoader as never, Component: corpus.default as ComponentType }], { initialEntries: [path] });
  renderInApp(<OutcomeToastProvider><RouterProvider router={router} /></OutcomeToastProvider>);
  return router;
};

beforeEach(() => {
  requests = [];
  useAuthStore.getState().clear();
  vi.stubGlobal('fetch', vi.fn(fakeServer));
});
afterEach(() => vi.unstubAllGlobals());

describe('the recordings list', () => {
  it('lists the first page and offers the rest', async () => {
    renderCorpus();
    expect(await screen.findByRole('link', { name: 'model-r1' })).toBeTruthy();
    expect(screen.getByText('Showing 2 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy();
    expect(requests[0]!.searchParams.get('limit')).toBe('100');
  });

  it('writes a filter into the address and fetches with it', async () => {
    const router = renderCorpus();
    await screen.findByRole('link', { name: 'model-r1' });
    fireEvent.click(screen.getByRole('combobox', { name: 'Outcome' }));
    fireEvent.click(await screen.findByRole('option', { name: 'http_error:*' }));
    expect(await screen.findByRole('link', { name: 'model-r3' })).toBeTruthy();
    expect(router.state.location.search).toBe('?outcome=http_error%3A*');
    expect(requests.at(-1)!.searchParams.get('outcome')).toBe('http_error:*');

    fireEvent.change(screen.getByRole('textbox', { name: 'Model' }), { target: { value: 'claude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(router.state.location.search).toBe('?outcome=http_error%3A*&model=claude'));
    expect(requests.at(-1)!.searchParams.get('model')).toBe('claude');
  });

  it('reads its filters back from the address', async () => {
    renderCorpus('/corpus?protocol=openai-responses&q=weather');
    await screen.findByRole('link', { name: 'model-r1' });
    expect(requests[0]!.searchParams.get('protocol')).toBe('openai-responses');
    expect(requests[0]!.searchParams.get('q')).toBe('weather');
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('weather');
  });

  it('tones each outcome by what it says about the exchange', async () => {
    renderCorpus('/corpus?outcome=http_error:*');
    const row = (await screen.findByRole('link', { name: 'model-r3' })).closest('tr')!;
    expect(within(row).getByText('http_error:529')).toBeTruthy();
  });
});
