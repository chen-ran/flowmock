// A small Prometheus registry: counters by label set and fixed-bucket
// histograms for the achieved TTFT and decode speed.
// https://prometheus.io/docs/instrumenting/exposition_formats/

type Labels = Record<string, string>;

const labelKey = (labels: Labels): string => Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}="${value.replace(/["\\\n]/g, char => (char === '\n' ? '\\n' : `\\${char}`))}"`).join(',');

class Counter {
  readonly values = new Map<string, number>();

  inc(labels: Labels, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }
}

class Histogram {
  readonly buckets: readonly number[];
  readonly series = new Map<string, { counts: number[]; sum: number; count: number }>();

  constructor(buckets: readonly number[]) {
    this.buckets = buckets;
  }

  observe(labels: Labels, value: number): void {
    const key = labelKey(labels);
    let series = this.series.get(key);
    if (!series) {
      series = { counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, series);
    }
    this.buckets.forEach((bound, index) => { if (value <= bound) series.counts[index]++; });
    series.sum += value;
    series.count++;
  }
}

export class Metrics {
  readonly requests = new Counter();
  readonly faults = new Counter();
  readonly recordings = new Counter();
  readonly ttft = new Histogram([50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000]);
  readonly tps = new Histogram([5, 10, 20, 40, 60, 80, 120, 200, 400, 1000]);
  private readonly activeStreams: () => number;

  constructor(activeStreams: () => number) {
    this.activeStreams = activeStreams;
  }

  render(): string {
    const lines: string[] = [];
    const counter = (name: string, help: string, metric: Counter) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      for (const [labels, value] of metric.values) lines.push(`${name}{${labels}} ${value}`);
    };
    const histogram = (name: string, help: string, metric: Histogram) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} histogram`);
      for (const [labels, series] of metric.series) {
        const prefix = labels ? `${labels},` : '';
        metric.buckets.forEach((bound, index) => lines.push(`${name}_bucket{${prefix}le="${bound}"} ${series.counts[index]}`));
        lines.push(`${name}_bucket{${prefix}le="+Inf"} ${series.count}`, `${name}_sum{${labels}} ${series.sum}`, `${name}_count{${labels}} ${series.count}`);
      }
    };
    counter('flowmock_requests_total', 'Data-plane requests by protocol, mode and outcome.', this.requests);
    counter('flowmock_faults_total', 'Injected faults by type.', this.faults);
    counter('flowmock_recordings_total', 'Exchanges recorded by protocol and outcome.', this.recordings);
    histogram('flowmock_achieved_ttft_ms', 'Time to first output byte measured on the wire.', this.ttft);
    histogram('flowmock_achieved_tps', 'Output tokens per second measured on the wire.', this.tps);
    lines.push('# HELP flowmock_active_requests Data-plane requests in flight.', '# TYPE flowmock_active_requests gauge', `flowmock_active_requests ${this.activeStreams()}`);
    return `${lines.join('\n')}\n`;
  }
}
