import type { ReplayTrace, RunResult } from '@flowmock/core';

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

// The most recent requests, newest first, for debugging a run.
export class Timeline {
  private readonly entries: TimelineEntry[] = [];
  private readonly capacity: number;
  private readonly listeners = new Set<(entry: TimelineEntry) => void>();

  constructor(capacity = 1000) {
    this.capacity = capacity;
  }

  add(entry: TimelineEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.capacity) this.entries.length = this.capacity;
    for (const listener of this.listeners) listener(entry);
  }

  list(limit = 100, filter: { mode?: string; keyName?: string } = {}): TimelineEntry[] {
    return this.entries.filter(entry => (filter.mode === undefined || entry.mode === filter.mode) && (filter.keyName === undefined || entry.keyName === filter.keyName)).slice(0, limit);
  }

  get(id: string): TimelineEntry | null {
    return this.entries.find(entry => entry.id === id) ?? null;
  }

  subscribe(listener: (entry: TimelineEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
