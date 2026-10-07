import { describe, expect, it, vi } from 'vitest';

import { ignoreMonacoCancellations } from '../../src/controls/monaco-cancellation.ts';

type Rejection = { reason: unknown; preventDefault: () => void };

describe('Monaco cancellations', () => {
  const listeners: Array<(event: Rejection) => void> = [];
  ignoreMonacoCancellations({ addEventListener: (_type, listener) => { listeners.push(listener); } });
  const dispatch = (reason: unknown) => {
    const preventDefault = vi.fn();
    for (const listener of listeners) listener({ reason, preventDefault });
    return preventDefault.mock.calls.length > 0;
  };

  it('drops the rejection a disposed editor leaves behind', () => {
    const canceled = new Error('Canceled');
    canceled.name = 'Canceled';
    expect(dispatch(canceled)).toBe(true);
  });

  it('leaves every other rejection to be reported', () => {
    expect(dispatch(new Error('Canceled'))).toBe(false);
    const named = new Error('the request was canceled');
    named.name = 'Canceled';
    expect(dispatch(named)).toBe(false);
    expect(dispatch('Canceled')).toBe(false);
    expect(dispatch(new TypeError('boom'))).toBe(false);
  });
});
