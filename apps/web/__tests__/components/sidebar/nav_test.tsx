import { screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { Sidebar } from '../../../src/components/sidebar/nav.tsx';
import { useAuthStore } from '../../../src/stores/auth-store.ts';
import { renderInApp } from '../../render.tsx';

const renderSidebar = (path: string) => {
  const router = createMemoryRouter([{ path: '*', element: <Sidebar /> }], { initialEntries: [path] });
  renderInApp(<RouterProvider router={router} />);
};

afterEach(() => useAuthStore.setState({ access: null }));

describe('the sidebar', () => {
  it('marks the page a path belongs to, a detail page included', () => {
    renderSidebar('/corpus/rec_01');
    const nav = screen.getByRole('navigation', { name: 'Navigation' });
    const current = within(nav).getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.textContent)).toEqual(['Recordings']);
  });

  it('gives the overview only its own root', () => {
    renderSidebar('/');
    const current = screen.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.textContent)).toEqual(['Overview']);
  });

  it('offers signing out only to a browser signed in with a session', () => {
    useAuthStore.setState({ access: { token: null, via: 'open' } });
    renderSidebar('/settings');
    expect(screen.queryByText('Sign out')).toBeNull();
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });

  it('offers signing out to a session', () => {
    useAuthStore.setState({ access: { token: 'session-1', via: 'session' } });
    renderSidebar('/');
    expect(screen.getByText('Sign out')).toBeTruthy();
  });
});
