import type { ReplayTrace, RunResult } from '@flowmock/core';

export interface TimelineFilter { mode?: string; keyName?: string; protocol?: string; outcome?: string; before?: string }
export interface TimelineBackend {
  add(entry: TimelineEntry): void;
  list(limit: number, filter: TimelineFilter): TimelineEntry[];
  get(id: string): TimelineEntry | null;
}

export interface TimelineEntry {
  id: string;
  // Epoch milliseconds.
  startedAt: number;
  mode: 'record' | 'replay';
  keyName: string;
  protocol: string;
  transport: 'http' | 'ws';
  method: string;
  path: string;
  model: string | null;
  status: number | null;
  durationMs: number | null;
  recordingId: string | null;
  cassetteId: string | null;
  // Replay only.
  trace: ReplayTrace | null;
  result: RunResult | null;
  expected: { ttftMs: number | null; tps: number | null; durationMs: number } | null;
  // Recording only.
  outcome: string | null;
  error: string | null;
}

export const summary = (entry: TimelineEntry) => ({
  id: entry.id,
  startedAt: entry.startedAt,
  mode: entry.mode,
  keyName: entry.keyName,
  protocol: entry.protocol,
  transport: entry.transport,
  status: entry.status,
  outcome: entry.outcome,
  recordingId: entry.recordingId,
  achievedTtftMs: entry.result?.achievedTtftMs ?? null,
  achievedTps: entry.result?.achievedTps ?? null,
  fault: entry.trace?.fault?.type ?? null,
});

// The most recent requests, newest first, for debugging a run.
export class Timeline {
  private readonly entries: TimelineEntry[] = [];
  private readonly capacity: number;
  private readonly listeners = new Set<(entry: TimelineEntry) => void>();
  private readonly backend?: TimelineBackend;

  constructor(capacity = 1000, backend?: TimelineBackend) {
    this.capacity = capacity;
    this.backend = backend;
  }

  add(entry: TimelineEntry): void {
    this.backend?.add(entry);
    this.entries.unshift(entry);
    this.entries.sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));
    if (this.entries.length > this.capacity) this.entries.length = this.capacity;
    for (const listener of this.listeners) listener(entry);
  }

  list(limit = 100, filter: TimelineFilter = {}): TimelineEntry[] {
    // The database is authoritative when enabled: filtered pages can span
    // the hot cache, and retention must also apply to cached entries.
    if (this.backend) return this.backend.list(limit, filter);
    const cursor = filter.before === undefined ? undefined : this.entries.find(entry => entry.id === filter.before);
    if (filter.before !== undefined && cursor === undefined) return [];
    return this.entries.filter(entry =>
      (cursor === undefined || entry.startedAt < cursor.startedAt || (entry.startedAt === cursor.startedAt && entry.id < cursor.id))
      && (filter.mode === undefined || entry.mode === filter.mode)
      && (filter.keyName === undefined || entry.keyName === filter.keyName)
      && (filter.protocol === undefined || entry.protocol === filter.protocol)
      && (filter.outcome === undefined || entry.outcome === filter.outcome)).slice(0, limit);
  }

  get(id: string): TimelineEntry | null {
    return this.backend ? this.backend.get(id) : this.entries.find(entry => entry.id === id) ?? null;
  }

  subscribe(listener: (entry: TimelineEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number { return this.listeners.size; }

  clear(): void {
    this.entries.length = 0;
  }
}
