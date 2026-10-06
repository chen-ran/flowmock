import { useCallback, useState } from 'react';

import { type EventSourceFactory, type StreamStatus, useServerEvents } from '../../lib/use-server-events.ts';

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

export interface LiveState {
  snapshots: readonly LiveSnapshot[];
  status: StreamStatus;
}

// Follows the live snapshots while the tab is shown.
export const useLive = ({ createSource }: { createSource?: EventSourceFactory } = {}): LiveState => {
  const [snapshots, setSnapshots] = useState<LiveSnapshot[]>([]);
  const onEvent = useCallback((data: string) => {
    setSnapshots(previous => trimWindow([...previous, JSON.parse(data) as LiveSnapshot]));
  }, []);
  const status = useServerEvents({ createSource, event: 'snapshot', onEvent, path: '/api/live' });
  return { snapshots, status };
};
