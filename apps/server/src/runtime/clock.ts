import { performance } from 'node:perf_hooks';

import type { Clock } from '@flowmock/core';

// Real time on Node. `setTimeout` resolves in whole milliseconds, which is
// the granularity every FlowMock schedule is expressed in.
export const nodeClock: Clock = {
  now: () => performance.now(),
  sleepUntil: (deadline, signal) => {
    if (signal?.aborted) return Promise.reject(signal.reason as Error);
    const delay = deadline - performance.now();
    if (delay <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal!.reason as Error);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  },
};
