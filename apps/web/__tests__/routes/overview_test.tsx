import { screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as overview from '../../src/routes/index.tsx';
import { useAuthStore } from '../../src/stores/auth-store.ts';
import { renderInApp } from '../render.tsx';
import { OutcomeToastProvider } from '@flowmock/ui/controls/outcome-toast.tsx';

// The overview follows the live snapshots; nothing is sent on this stand-in.
class SilentSource {
  addEventListener() {}
  close() {}
}

let stats: unknown;
const fakeServer = async (input: RequestInfo | URL): Promise<Response> => {
  const url = new URL(String(input), 'http://flowmock.test');
  if (url.pathname === '/api/auth/me') return Response.json({ via: 'open' });
  if (url.pathname === '/api/stats') return Response.json(stats);
  if (url.pathname === '/api/requests') {
    return Response.json({ items: [{ id: 'req_1', startedAt: 0, mode: 'replay', keyName: 'demo weak network', protocol: 'anthropic-messages', transport: 'http', model: 'claude-sonnet-4-5', status: 429, durationMs: 90, outcome: 'completed', recordingId: null, trace: { fault: { rule: 0, type: 'http_error' } }, result: null }] });
  }
  return new Response(null, { status: 404 });
};

const renderOverview = () => {
  const router = createMemoryRouter([{ path: '/', loader: overview.clientLoader, element: <OutcomeToastProvider><overview.default /></OutcomeToastProvider> }]);
  renderInApp(<RouterProvider router={router} />);
};

beforeEach(() => {
  useAuthStore.getState().clear();
  vi.stubGlobal('fetch', vi.fn(fakeServer));
  vi.stubGlobal('EventSource', SilentSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('the overview', () => {
  it('sums up the corpus and lists the latest requests', async () => {
    stats = {
      recordings: 1234, bytes: 5 * 1024 * 1024,
      byProtocol: [{ protocol: 'anthropic-messages', recordings: 1200, bytes: 5_000_000 }, { protocol: 'openai-responses', recordings: 34, bytes: 242_880 }],
      byOutcome: [{ outcome: 'ok', recordings: 1230, bytes: 4_000_000 }, { outcome: 'http_error:429', recordings: 4, bytes: 42_880 }],
      byModel: [{ model: 'claude-sonnet-4-5', recordings: 1200, bytes: 5_000_000 }],
    };
    renderOverview();
    expect(await screen.findByText('1,234')).toBeTruthy();
    expect(screen.getByText('5 MB')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Recordings by outcome' })).getByText('http_error:429')).toBeTruthy();
    const recent = screen.getByRole('table', { name: 'Requests' });
    expect(within(recent).getByText('429')).toBeTruthy();
    expect(within(recent).getByText('HTTP error')).toBeTruthy();
  });

  it('says how to fill an empty corpus', async () => {
    stats = { recordings: 0, bytes: 0, byProtocol: [], byOutcome: [], byModel: [] };
    renderOverview();
    expect(await screen.findByText('The corpus is empty')).toBeTruthy();
  });
});
