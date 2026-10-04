import type { DatabaseSync } from 'node:sqlite';

import type { TimelineEntry, TimelineFilter } from '../state/timeline.ts';

export interface TimelineOptions { persist?: boolean; retainDays?: number; maxEntries?: number }

export class TraceStore {
  private readonly db: DatabaseSync;
  private readonly retainDays: number;
  private readonly maxEntries: number;

  constructor(db: DatabaseSync, options: TimelineOptions = {}) {
    this.db = db;
    this.retainDays = options.retainDays ?? 7;
    this.maxEntries = options.maxEntries ?? 100_000;
  }

  add(entry: TimelineEntry): void {
    const stored = { ...entry, trace: entry.trace === null ? null : { ...entry.trace, frames: entry.trace.frames.slice(0, 500) } };
    this.db.prepare('INSERT INTO request_traces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.startedAt, entry.mode, entry.keyName, entry.protocol, entry.status, entry.outcome, entry.recordingId, JSON.stringify(stored));
    this.trimSize();
  }

  get(id: string): TimelineEntry | null {
    const row = this.db.prepare('SELECT entry FROM request_traces WHERE id = ?').get(id) as { entry: string } | undefined;
    return row ? JSON.parse(row.entry) as TimelineEntry : null;
  }

  list(limit = 100, filter: TimelineFilter = {}): TimelineEntry[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    for (const [key, column] of [['mode', 'mode'], ['keyName', 'key_name'], ['protocol', 'protocol'], ['outcome', 'outcome']] as const) {
      if (filter[key] !== undefined) { clauses.push(`${column} = ?`); values.push(filter[key]); }
    }
    if (filter.before !== undefined) {
      const cursor = this.db.prepare('SELECT started_at FROM request_traces WHERE id = ?').get(filter.before) as { started_at: number } | undefined;
      if (!cursor) return [];
      clauses.push('(started_at < ? OR (started_at = ? AND id < ?))');
      values.push(cursor.started_at, cursor.started_at, filter.before);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return (this.db.prepare(`SELECT entry FROM request_traces ${where} ORDER BY started_at DESC, id DESC LIMIT ?`).all(...values, limit) as Array<{ entry: string }>).map(row => JSON.parse(row.entry) as TimelineEntry);
  }

  private trimSize(): void {
    this.db.prepare('DELETE FROM request_traces WHERE id IN (SELECT id FROM request_traces ORDER BY started_at DESC, id DESC LIMIT -1 OFFSET ?)').run(this.maxEntries);
  }

  prune(now = Date.now()): void {
    this.db.prepare('DELETE FROM request_traces WHERE started_at < ?').run(now - this.retainDays * 86_400_000);
    this.trimSize();
  }
}
