import type { Context } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';

import type { AdminEnv } from './auth.ts';
import type { Services } from '../services.ts';
import { summary } from '../state/timeline.ts';

// Bound each subscriber's queue: a slow dashboard disconnects and can reopen
// its stream instead of retaining an unlimited number of request summaries.
const runStream = (c: Context<AdminEnv>, services: Services, setup: (stream: SSEStreamingApi, send: (work: () => Promise<unknown>) => void) => () => void) => streamSSE(c, async stream => {
  let pending = 0;
  let queue = Promise.resolve();
  const send = (work: () => Promise<unknown>) => {
    if (stream.aborted) return;
    if (++pending > 256) { stream.abort(); return; }
    queue = queue.then(async () => { if (!stream.aborted) await work(); }).finally(() => { pending--; });
    void queue.catch(() => stream.abort());
  };
  await new Promise<void>(resolve => {
    const cleanup = setup(stream, send);
    const abort = () => stream.abort();
    services.controlStreams.signal.addEventListener('abort', abort, { once: true });
    stream.onAbort(() => {
      cleanup();
      services.controlStreams.signal.removeEventListener('abort', abort);
      resolve();
    });
    if (services.controlStreams.signal.aborted) abort();
  });
});

export const liveStream = (c: Context<AdminEnv>, services: Services) => runStream(c, services, (stream, send) => {
  const snapshot = () => send(async () => await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(services.live.snapshot()) }));
  snapshot();
  const timer = setInterval(snapshot, 1000);
  const heartbeat = setInterval(() => send(async () => await stream.write(': keep-alive\n\n')), 15_000);
  return () => { clearInterval(timer); clearInterval(heartbeat); };
});

export const requestStream = (c: Context<AdminEnv>, services: Services) => runStream(c, services, (stream, send) => {
  const unsubscribe = services.timeline.subscribe(entry => send(async () => await stream.writeSSE({ event: 'request', id: entry.id, data: JSON.stringify(summary(entry)) })));
  send(async () => await stream.write(': ready\n\n'));
  const heartbeat = setInterval(() => send(async () => await stream.write(': keep-alive\n\n')), 15_000);
  return () => { unsubscribe(); clearInterval(heartbeat); };
});
