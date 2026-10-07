import { useEffect, useRef, useState } from 'react';

import { getSessionToken } from '../auth/session.ts';

const MAX_RECONNECT_DELAY_MS = 30_000;

export const reconnectDelay = (attempt: number): number => Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** attempt);

export const STREAM_STATUSES = ['connecting', 'live', 'reconnecting', 'paused'] as const;
export type StreamStatus = typeof STREAM_STATUSES[number];

export type EventSourceFactory = (url: string) => EventSource;

// EventSource sends no custom header, so the browser's admin session rides in
// the query, which the server accepts on its stream routes alone.
const streamUrl = (path: string) => {
  const token = getSessionToken();
  return token === null ? path : `${path}?session=${encodeURIComponent(token)}`;
};

// Follows one of the server's event streams while the tab is shown and the
// caller wants it. A dropped stream is reopened after a wait that doubles with
// every failure in a row; a hidden tab or a disabled caller holds no stream at
// all, and resumes from a fresh connection.
export const useServerEvents = ({ createSource = url => new EventSource(url), enabled = true, event, onEvent, path }: {
  createSource?: EventSourceFactory;
  enabled?: boolean;
  event: string;
  onEvent: (data: string) => void;
  path: string;
}): StreamStatus => {
  const [status, setStatus] = useState<StreamStatus>(() => (enabled && document.visibilityState === 'visible' ? 'connecting' : 'paused'));
  const createSourceRef = useRef(createSource);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

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
      const opened = createSourceRef.current(streamUrl(path));
      source = opened;
      opened.addEventListener('open', () => {
        failures = 0;
        setStatus('live');
      });
      opened.addEventListener(event, message => {
        setStatus('live');
        onEventRef.current((message as MessageEvent<string>).data);
      });
      // EventSource retries on its own at a fixed pace; it is closed instead,
      // so the wait can grow.
      opened.addEventListener('error', () => {
        close();
        setStatus('reconnecting');
        retry = window.setTimeout(connect, reconnectDelay(failures++));
      });
    };

    const follow = () => {
      if (enabled && document.visibilityState === 'visible') {
        failures = 0;
        setStatus('connecting');
        connect();
      } else {
        close();
        setStatus('paused');
      }
    };

    if (enabled && document.visibilityState === 'visible') connect();
    else if (!enabled) close();
    document.addEventListener('visibilitychange', follow);
    return () => {
      close();
      document.removeEventListener('visibilitychange', follow);
    };
  }, [enabled, event, path]);

  return enabled ? status : 'paused';
};
