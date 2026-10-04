import type { TimelineEntry } from './timeline.ts';

interface Sample {
  at: number;
  protocol: string;
  ok: boolean;
  fault: string | null;
  ttftMs: number | null;
  tps: number | null;
}

interface Quantiles { p50: number | null; p90: number | null; p99: number | null }
export interface LiveSnapshot {
  at: number;
  activeRequests: number;
  requestsPerSecond: number;
  byProtocol: Record<string, { requests: number; errors: number }>;
  faults: Record<string, number>;
  ttftMs: Quantiles;
  tps: Quantiles;
}

const quantiles = (values: number[]): Quantiles => {
  values.sort((a, b) => a - b);
  const rank = (p: number): number | null => values[Math.ceil(values.length * p) - 1] ?? null;
  return { p50: rank(0.5), p90: rank(0.9), p99: rank(0.99) };
};

export const fromEntry = (entry: TimelineEntry, at = Date.now()): Sample => ({
  at,
  protocol: entry.protocol,
  ok: entry.status !== null && entry.status < 400 && ['completed', 'ok', 'proxied'].includes(entry.outcome ?? ''),
  fault: entry.trace?.fault?.type ?? null,
  ttftMs: entry.result?.achievedTtftMs ?? null,
  tps: entry.result?.achievedTps ?? null,
});

export class LiveAggregator {
  private samples: Sample[] = [];
  private readonly active: () => number;

  constructor(active: () => number) { this.active = active; }

  observe(sample: Sample): void {
    this.samples.push(sample);
    // Prune on writes too, so an unused dashboard does not grow the buffer.
    this.samples = this.samples.filter(item => item.at >= sample.at - 60_000);
  }

  snapshot(now = Date.now()): LiveSnapshot {
    this.samples = this.samples.filter(sample => sample.at >= now - 60_000);
    const samples = this.samples.filter(sample => sample.at <= now);
    const byProtocol: LiveSnapshot['byProtocol'] = {};
    const faults: Record<string, number> = {};
    for (const sample of samples) {
      const counts = byProtocol[sample.protocol] ??= { requests: 0, errors: 0 };
      counts.requests++;
      if (!sample.ok) counts.errors++;
      if (sample.fault !== null) faults[sample.fault] = (faults[sample.fault] ?? 0) + 1;
    }
    return {
      at: now,
      activeRequests: this.active(),
      requestsPerSecond: samples.filter(sample => sample.at > now - 10_000).length / 10,
      byProtocol,
      faults,
      ttftMs: quantiles(samples.flatMap(sample => sample.ttftMs === null ? [] : [sample.ttftMs])),
      tps: quantiles(samples.flatMap(sample => sample.tps === null ? [] : [sample.tps])),
    };
  }
}
