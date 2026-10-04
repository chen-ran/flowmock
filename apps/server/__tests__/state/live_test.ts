import { describe, expect, it } from 'vitest';

import { LiveAggregator } from '../../src/state/live.ts';

describe('LiveAggregator', () => {
  it('computes nearest-rank quantiles, rates and trims expired samples', () => {
    const live = new LiveAggregator(() => 2);
    for (let index = 1; index <= 100; index++) live.observe({ at: 1000 + index, protocol: 'anthropic-messages', ok: true, fault: null, ttftMs: index * 10, tps: index });
    const snapshot = live.snapshot(1200);
    expect(snapshot.activeRequests).toBe(2);
    expect(snapshot.requestsPerSecond).toBe(10);
    expect(snapshot.byProtocol).toEqual({ 'anthropic-messages': { requests: 100, errors: 0 } });
    expect(snapshot.ttftMs.p50).toBe(500);
    expect(snapshot.tps.p99).toBe(99);
    expect(live.snapshot(70_000).ttftMs.p50).toBeNull();
  });

  it('counts faults and errors and handles samples arriving out of order', () => {
    const live = new LiveAggregator(() => 0);
    live.observe({ at: 70_000, protocol: 'openai-chat-completions', ok: true, fault: null, ttftMs: null, tps: null });
    live.observe({ at: 0, protocol: 'openai-chat-completions', ok: false, fault: 'http_error', ttftMs: null, tps: null });
    expect(live.snapshot(30_000).faults).toEqual({ http_error: 1 });
    expect(live.snapshot(70_000).faults).toEqual({});
    expect(live.snapshot(70_000).byProtocol['openai-chat-completions']).toEqual({ requests: 1, errors: 0 });
  });
});
