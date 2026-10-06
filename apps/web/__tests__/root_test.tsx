import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from './render.tsx';
import { ErrorBoundary, HydrateFallback } from '../src/root.tsx';

type BoundaryProps = Parameters<typeof ErrorBoundary>[0];
const boundary = (error: unknown) => ({ error } as unknown as BoundaryProps);

describe('the root route', () => {
  it('boots behind the loading screen', () => {
    renderInApp(<HydrateFallback />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('answers a missing route with a 404 page that offers a way back', () => {
    renderInApp(<ErrorBoundary {...boundary({ status: 404, statusText: 'Not Found', internal: true, data: '' })} />);
    expect(screen.getByRole('heading', { name: '404' })).toBeTruthy();
    expect(screen.getByText('The requested page could not be found')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('shows a thrown error with its trace in place of the message', () => {
    const error = new Error('The recording has no frames.');
    renderInApp(<ErrorBoundary {...boundary(error)} />);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByText(/The recording has no frames\./)).toBeTruthy();
  });
});
