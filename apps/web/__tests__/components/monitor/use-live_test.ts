import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setSessionToken } from '../../../src/auth/session.ts';
import { type LiveSnapshot, reconnectDelay, trimWindow, useLive } from '../../../src/components/monitor/use-live.ts';

// A stand-in EventSource the suite drives: it records what was opened and
// closed, and delivers events when told to.
class FakeSource {
  static opened: FakeSource[] = [];
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeSource.opened.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data = '') {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data }));
  }
}

const latest = () => FakeSource.opened.at(-1)!;
const snapshot = (at: number): LiveSnapshot => ({ at, activeRequests: 0, requestsPerSecond: 0, byProtocol: {}, faults: {}, ttftMs: { p50: null, p90: null, p99: null }, tps: { p50: null, p90: null, p99: null } });

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (next: DocumentVisibilityState) => act(() => {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
});

const renderLive = () => renderHook(() => useLive({ createSource: url => new FakeSource(url) as unknown as EventSource }));

beforeEach(() => {
  vi.useFakeTimers();
  FakeSource.opened = [];
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('the live window', () => {
  it('keeps the last ten minutes, measured from the newest snapshot', () => {
    const minute = 60_000;
    expect(trimWindow([snapshot(0), snapshot(5 * minute), snapshot(11 * minute)]).map(item => item.at)).toEqual([5 * minute, 11 * minute]);
    expect(trimWindow([])).toEqual([]);
  });

  it('backs off exponentially, to at most thirty seconds', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
  });
});

describe('the live subscription', () => {
  it('subscribes with the browser session and gathers snapshots', () => {
    setSessionToken('session token');
    const { result } = renderLive();
    expect(latest().url).toBe('/api/live?session=session%20token');
    expect(result.current.status).toBe('connecting');
    act(() => {
      latest().emit('open');
      latest().emit('snapshot', JSON.stringify(snapshot(1000)));
      latest().emit('snapshot', JSON.stringify(snapshot(2000)));
    });
    expect(result.current.status).toBe('live');
    expect(result.current.snapshots.map(item => item.at)).toEqual([1000, 2000]);
  });

  it('reconnects after a drop, waiting longer each time until one connects', () => {
    const { result } = renderLive();
    expect(latest().url).toBe('/api/live');
    act(() => latest().emit('error'));
    expect(latest().closed).toBe(true);
    expect(result.current.status).toBe('reconnecting');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeSource.opened).toHaveLength(2);
    act(() => latest().emit('error'));
    act(() => { vi.advanceTimersByTime(1999); });
    expect(FakeSource.opened).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeSource.opened).toHaveLength(3);
    // A connection that opens starts the count again.
    act(() => latest().emit('open'));
    act(() => latest().emit('error'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeSource.opened).toHaveLength(4);
  });

  it('lets go of the stream while the tab is hidden and resumes when it is shown', () => {
    const { result, unmount } = renderLive();
    act(() => latest().emit('error'));
    setVisibility('hidden');
    expect(latest().closed).toBe(true);
    expect(result.current.status).toBe('paused');
    // The retry a drop scheduled does not reopen a hidden tab's stream.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(FakeSource.opened).toHaveLength(1);
    setVisibility('visible');
    expect(FakeSource.opened).toHaveLength(2);
    expect(latest().closed).toBe(false);
    unmount();
    expect(latest().closed).toBe(true);
  });
});
