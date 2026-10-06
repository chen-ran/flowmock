import { useEffect, useRef, useState } from 'react';

import { getSessionToken } from '../../auth/session.ts';

interface Quantiles { p50: number | null; p90: number | null; p99: number | null }

// What /api/live sends once a second: the last minute of replays, rolled up.
// The stream is server-sent events rather than a typed route, so the shape is
// restated from apps/server/src/state/live.ts.
export interface LiveSnapshot {
  at: number;
  activeRequests: number;
  requestsPerSecond: number;
  byProtocol: Record<string, { requests: number; errors: number }>;
  faults: Record<string, number>;
  ttftMs: Quantiles;
  tps: Quantiles;
}

export const LIVE_WINDOW_MS = 10 * 60_000;

// The charts hold the last ten minutes, measured on the server's clock from
// the newest snapshot, so a browser whose clock is off does not empty them.
export const trimWindow = (snapshots: readonly LiveSnapshot[], windowMs = LIVE_WINDOW_MS): LiveSnapshot[] => {
  const newest = snapshots.at(-1)?.at;
  return newest === undefined ? [] : snapshots.filter(item => item.at >= newest - windowMs);
};

const MAX_RECONNECT_DELAY_MS = 30_000;

export const reconnectDelay = (attempt: number): number => Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** attempt);

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'paused';

export interface LiveState {
  snapshots: readonly LiveSnapshot[];
  status: LiveStatus;
}

// EventSource sends no custom header, so the browser's admin session rides in
// the query, which the server accepts on its two stream routes alone.
const liveUrl = () => {
  const token = getSessionToken();
  return token === null ? '/api/live' : `/api/live?session=${encodeURIComponent(token)}`;
};

// Follows the live snapshots while the tab is shown. A dropped stream is
// reopened after a wait that doubles with every failure in a row, and a hidden
// tab holds no stream at all: it resumes, from a fresh connection, when shown.
export const useLive = ({ createSource = url => new EventSource(url) }: { createSource?: (url: string) => EventSource } = {}): LiveState => {
  const [snapshots, setSnapshots] = useState<LiveSnapshot[]>([]);
  const [status, setStatus] = useState<LiveStatus>(() => (document.visibilityState === 'visible' ? 'connecting' : 'paused'));
  const createSourceRef = useRef(createSource);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: number | undefined;
    let failures = 0;

    const close = () => {
      source?.close();
      source = null;
      window.clearTimeout(retry);
      retry = undefined;
    };

    const connect = () => {
      close();
      const opened = createSourceRef.current(liveUrl());
      source = opened;
      opened.addEventListener('open', () => {
        failures = 0;
        setStatus('live');
      });
      opened.addEventListener('snapshot', event => {
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as LiveSnapshot;
        setStatus('live');
        setSnapshots(previous => trimWindow([...previous, snapshot]));
      });
      // EventSource retries on its own at a fixed pace; it is closed instead,
      // so the wait can grow.
      opened.addEventListener('error', () => {
        close();
        setStatus('reconnecting');
        retry = window.setTimeout(connect, reconnectDelay(failures++));
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        failures = 0;
        setStatus('connecting');
        connect();
      } else {
        close();
        setStatus('paused');
      }
    };

    if (document.visibilityState === 'visible') connect();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      close();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { snapshots, status };
};
