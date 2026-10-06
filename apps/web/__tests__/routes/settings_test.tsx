import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flowmockSessionHeader, getSessionToken, setSessionToken } from '../../src/auth/session.ts';
import { setLanguage } from '../../src/i18n/index.ts';
import * as settings from '../../src/routes/settings.tsx';
import { useAuthStore } from '../../src/stores/auth-store.ts';
import { renderInApp } from '../render.tsx';
import { flowmockLanguageStorageKey } from '@flowmock/ui/i18n';

let revoked: string[] = [];
let adminKey = true;

const fakeServer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input), 'http://flowmock.test');
  const token = new Headers(init?.headers).get(flowmockSessionHeader);
  if (url.pathname === '/api/auth/me') return Response.json({ via: adminKey ? 'session' : 'open' });
  if (url.pathname === '/api/auth/session' && init?.method === 'DELETE') {
    revoked.push(token!);
    return new Response(null, { status: 204 });
  }
  if (url.pathname === '/api/settings') {
    return Response.json(adminKey
      ? { version: '0.1.0', adminKey: true, timeline: { persist: true, retainDays: 7, maxEntries: 100000 } }
      : { version: '0.1.0', adminKey: false, timeline: { persist: false } });
  }
  return new Response(null, { status: 404 });
};

const renderSettings = () => {
  const router = createMemoryRouter([
    { path: '/settings', loader: settings.clientLoader, Component: settings.default },
    { path: '/login', element: <p>sign in</p> },
  ], { initialEntries: ['/settings'] });
  renderInApp(<RouterProvider router={router} />);
};

beforeEach(() => {
  revoked = [];
  adminKey = true;
  window.localStorage.clear();
  useAuthStore.getState().clear();
  setSessionToken('session-1');
  vi.stubGlobal('fetch', vi.fn(fakeServer));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await setLanguage('en');
});

describe('the settings page', () => {
  it('reports how the server runs', async () => {
    renderSettings();
    expect(await screen.findByText('0.1.0')).toBeTruthy();
    expect(screen.getByText('Protected by an admin key')).toBeTruthy();
    expect(screen.getByText('Request timeline kept for 7 days, up to 100,000 requests')).toBeTruthy();
  });

  it('switches the language and keeps the choice', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('combobox', { name: 'Language' }));
    fireEvent.click(await screen.findByRole('option', { name: '简体中文' }));
    expect(await screen.findByText('FlowMock 版本')).toBeTruthy();
    expect(window.localStorage.getItem(flowmockLanguageStorageKey)).toBe('zh-Hans');
  });

  it('signs a session out after confirmation, revoking it on the server', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(revoked).toEqual(['session-1']));
    expect(getSessionToken()).toBeNull();
    expect(useAuthStore.getState().access).toBeNull();
  });

  it('offers no sign-out to an open server', async () => {
    adminKey = false;
    window.localStorage.clear();
    renderSettings();
    expect(await screen.findByText('Open admin API')).toBeTruthy();
    expect(screen.getByText('Request timeline kept in memory')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
});
