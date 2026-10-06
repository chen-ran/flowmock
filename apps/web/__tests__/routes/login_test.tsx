import { fireEvent, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flowmockSessionHeader, getSessionToken, setSessionToken } from '../../src/auth/session.ts';
import * as dashboard from '../../src/routes/dashboard.tsx';
import * as login from '../../src/routes/login.tsx';
import { useAuthStore } from '../../src/stores/auth-store.ts';
import { renderInApp } from '../render.tsx';

// A stand-in for the admin API: an admin key (or none, for an open server)
// and the sessions it has issued.
let adminKey: string | null = null;
let sessions = new Set<string>();
let reachable = true;

const fakeServer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!reachable) throw new TypeError('Failed to fetch');
  const url = new URL(String(input), 'http://flowmock.test');
  const token = new Headers(init?.headers).get(flowmockSessionHeader);
  if (url.pathname === '/api/auth/me') {
    if (token !== null && sessions.has(token)) return Response.json({ via: 'session' });
    if (token === null && adminKey === null) return Response.json({ via: 'open' });
    return Response.json({ error: { code: 'unauthorized', message: 'no' } }, { status: 401 });
  }
  if (url.pathname === '/api/auth/login' && init?.method === 'POST') {
    const { key } = JSON.parse(String(init.body)) as { key: string };
    if (adminKey !== null && key !== adminKey) return Response.json({ error: { code: 'unauthorized', message: 'Invalid admin key.' } }, { status: 401 });
    const issued = `session-${sessions.size + 1}`;
    sessions.add(issued);
    return Response.json({ token: issued, expiresAt: 0 }, { status: 201 });
  }
  return new Response(null, { status: 404 });
};

const Overview = () => <main>overview</main>;
const renderApp = (path: string) => {
  const router = createMemoryRouter([
    { path: '/login', loader: login.clientLoader, action: login.clientAction as never, Component: login.default as ComponentType },
    { loader: dashboard.clientLoader, Component: dashboard.default, ErrorBoundary: () => <p>failed</p>, children: [{ index: true, Component: Overview }] },
  ], { initialEntries: [path] });
  renderInApp(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => {
  adminKey = null;
  sessions = new Set();
  reachable = true;
  window.localStorage.clear();
  useAuthStore.getState().clear();
  vi.stubGlobal('fetch', vi.fn(fakeServer));
});
afterEach(() => vi.unstubAllGlobals());

describe('signing in', () => {
  it('lets a browser straight in when the server runs without an admin key', async () => {
    const router = renderApp('/');
    expect(await screen.findByText('overview')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends a browser without a session to the sign-in form, and back once the key is right', async () => {
    adminKey = 'secret';
    const router = renderApp('/');
    const field = await screen.findByLabelText('Admin key');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter the admin key.')).toBeTruthy();

    fireEvent.change(field, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('This is not the server\'s admin key.')).toBeTruthy();
    expect(getSessionToken()).toBeNull();

    fireEvent.change(field, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('overview')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
    expect(getSessionToken()).toBe('session-1');
  });

  it('drops a session the server no longer honours', async () => {
    adminKey = 'secret';
    setSessionToken('revoked');
    renderApp('/');
    expect(await screen.findByLabelText('Admin key')).toBeTruthy();
    expect(getSessionToken()).toBeNull();
  });

  it('sends a signed-in browser away from the sign-in form', async () => {
    adminKey = 'secret';
    sessions.add('valid');
    setSessionToken('valid');
    const router = renderApp('/login');
    expect(await screen.findByText('overview')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('reports a server that did not answer instead of asking for a key', async () => {
    reachable = false;
    renderApp('/');
    expect(await screen.findByText('failed')).toBeTruthy();

    useAuthStore.getState().clear();
    renderApp('/login');
    expect(await screen.findByText('FlowMock did not answer. Check that the server is running.')).toBeTruthy();
  });
});
