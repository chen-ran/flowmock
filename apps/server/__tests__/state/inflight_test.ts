import { describe, expect, it } from 'vitest';

import { InflightTracker } from '../../src/state/inflight.ts';

describe('InflightTracker', () => {
  it('times out while work is active, drains on completion and preserves failures', async () => {
    const tracker = new InflightTracker();
    let finish!: () => void;
    const work = tracker.track(new Promise<void>(resolve => { finish = resolve; }));
    expect(await tracker.drain(1)).toEqual({ drained: false, remaining: 1 });
    const draining = tracker.drain(1000);
    finish();
    await work;
    expect(await draining).toEqual({ drained: true, remaining: 0 });
    const error = new Error('original');
    await expect(tracker.track(Promise.reject(error))).rejects.toBe(error);
    expect(await tracker.drain(0)).toEqual({ drained: true, remaining: 0 });
  });
});
