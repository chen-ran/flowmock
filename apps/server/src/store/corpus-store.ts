import type { DatabaseSync } from 'node:sqlite';

import type { ChunkFiles } from './chunk-files.ts';
import { transaction } from './database.ts';
import { type Cassette, type CorpusStore, newId, type RecordedRequest, type RecordedResponse, type Recording, type RecordingFeatures, type RecordingSummary } from '@flowmock/core';
import type { Protocol, WireFormat } from '@flowmock/protocols/common';

interface RecordingRow {
  id: string;
  created_at: number;
  protocol: Protocol;
  transport: 'http' | 'ws';
  model: string | null;
  status: number;
  wire: WireFormat;
  outcome: string;
  fingerprint: string;
  prefix_hashes: string;
  features: string;
  session_id: string | null;
  cassette_id: string | null;
  cassette_seq: number | null;
  request: string;
  response_meta: string;
  chunk_file: string;
  body_bytes: number;
}

interface CassetteRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  key_name: string | null;
  target_id: string | null;
  session_id: string | null;
  closed_at: number | null;
  description: string | null;
}

export interface CassetteInfo {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  keyName: string | null;
  targetId: string | null;
  sessionId: string | null;
  closedAt: number | null;
  description: string | null;
  recordings: number;
}

export interface RecordingFilter {
  protocol?: Protocol;
  model?: string;
  outcome?: string;
  cassetteId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

type ResponseMeta = Omit<RecordedResponse, 'chunks'>;

const summaryFromRow = (row: RecordingRow): RecordingSummary => ({
  id: row.id,
  createdAt: row.created_at,
  protocol: row.protocol,
  transport: row.transport,
  model: row.model,
  status: row.status,
  wire: row.wire,
  features: JSON.parse(row.features) as RecordingFeatures,
  fingerprint: row.fingerprint,
  prefixHashes: JSON.parse(row.prefix_hashes) as string[],
  sessionId: row.session_id,
  cassetteId: row.cassette_id,
  cassetteSeq: row.cassette_seq,
});

const cassetteFromRow = (row: CassetteRow & { recordings?: number }): CassetteInfo => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  keyName: row.key_name,
  targetId: row.target_id,
  sessionId: row.session_id,
  closedAt: row.closed_at,
  description: row.description,
  recordings: row.recordings ?? 0,
});

// Recently replayed recordings stay decoded in memory; a load test replays
// the same few recordings thousands of times.
class Lru<V> {
  private readonly entries = new Map<string, V>();
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

export class SqliteCorpus implements CorpusStore {
  private readonly db: DatabaseSync;
  private readonly chunks: ChunkFiles;
  private readonly candidates = new Map<Protocol, RecordingSummary[]>();
  private readonly loaded = new Lru<Recording>(256);
  // Bumped on every corpus write so observers (the models list) can cache.
  version = 0;

  constructor(db: DatabaseSync, chunks: ChunkFiles) {
    this.db = db;
    this.chunks = chunks;
  }

  private invalidate(): void {
    this.candidates.clear();
    this.version++;
  }

  async listCandidates(protocol: Protocol): Promise<readonly RecordingSummary[]> {
    let cached = this.candidates.get(protocol);
    if (!cached) {
      cached = (this.db.prepare('SELECT * FROM recordings WHERE protocol = ? ORDER BY created_at, id').all(protocol) as unknown as RecordingRow[]).map(summaryFromRow);
      this.candidates.set(protocol, cached);
    }
    return await Promise.resolve(cached);
  }

  async getRecording(id: string): Promise<Recording | null> {
    const cached = this.loaded.get(id);
    if (cached) return cached;
    const row = this.db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as RecordingRow | undefined;
    if (!row) return null;
    const meta = JSON.parse(row.response_meta) as ResponseMeta;
    const recording: Recording = {
      ...summaryFromRow(row),
      request: JSON.parse(row.request) as RecordedRequest,
      response: { ...meta, chunks: await this.chunks.read(row.chunk_file) },
    };
    this.loaded.set(id, recording);
    return recording;
  }

  async getCassette(id: string): Promise<Cassette | null> {
    const row = this.db.prepare('SELECT * FROM cassettes WHERE id = ?').get(id) as CassetteRow | undefined;
    if (!row) return null;
    const ids = (this.db.prepare('SELECT id FROM recordings WHERE cassette_id = ? ORDER BY cassette_seq, created_at').all(id) as Array<{ id: string }>).map(entry => entry.id);
    return await Promise.resolve({ id: row.id, name: row.name, createdAt: row.created_at, recordingIds: ids });
  }

  async saveRecording(recording: Recording): Promise<void> {
    const file = this.chunks.relativePath(recording.id);
    await this.chunks.write(file, recording.response.chunks);
    const { chunks, ...meta } = recording.response;
    this.db.prepare(`INSERT INTO recordings (id, created_at, protocol, transport, model, status, wire, outcome, fingerprint, prefix_hashes, features, session_id, cassette_id, cassette_seq, request, response_meta, chunk_file, body_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      recording.id,
      recording.createdAt,
      recording.protocol,
      recording.transport,
      recording.model,
      recording.response.status,
      recording.response.wire,
      recording.features.outcome,
      recording.fingerprint,
      JSON.stringify(recording.prefixHashes),
      JSON.stringify(recording.features),
      recording.sessionId,
      recording.cassetteId,
      recording.cassetteSeq,
      JSON.stringify(recording.request),
      JSON.stringify(meta satisfies ResponseMeta),
      file,
      chunks.reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0),
    );
    if (recording.cassetteId) this.db.prepare('UPDATE cassettes SET updated_at = ? WHERE id = ?').run(Date.now(), recording.cassetteId);
    this.invalidate();
  }

  list(filter: RecordingFilter = {}): { total: number; items: RecordingSummary[] } {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filter.protocol) { clauses.push('protocol = ?'); values.push(filter.protocol); }
    if (filter.model) { clauses.push('model = ?'); values.push(filter.model); }
    if (filter.outcome) { clauses.push('outcome GLOB ?'); values.push(filter.outcome); }
    if (filter.cassetteId) { clauses.push('cassette_id = ?'); values.push(filter.cassetteId); }
    if (filter.sessionId) { clauses.push('session_id = ?'); values.push(filter.sessionId); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) AS count FROM recordings ${where}`).get(...values) as { count: number }).count;
    const order = filter.cassetteId ? 'ORDER BY cassette_seq, created_at' : 'ORDER BY created_at DESC, id DESC';
    const rows = this.db.prepare(`SELECT * FROM recordings ${where} ${order} LIMIT ? OFFSET ?`).all(...values, filter.limit ?? 100, filter.offset ?? 0) as unknown as RecordingRow[];
    return { total, items: rows.map(summaryFromRow) };
  }

  async deleteRecording(id: string): Promise<boolean> {
    const row = this.db.prepare('SELECT chunk_file FROM recordings WHERE id = ?').get(id) as { chunk_file: string } | undefined;
    if (!row) return false;
    this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
    await this.chunks.remove(row.chunk_file);
    this.loaded.delete(id);
    this.invalidate();
    return true;
  }

  createCassette(input: { name: string; keyName?: string | null; targetId?: string | null; sessionId?: string | null; description?: string | null }, now = Date.now()): CassetteInfo {
    const id = newId('cas', now);
    this.db.prepare('INSERT INTO cassettes (id, name, created_at, updated_at, key_name, target_id, session_id, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.name, now, now, input.keyName ?? null, input.targetId ?? null, input.sessionId ?? null, input.description ?? null);
    return this.cassette(id)!;
  }

  cassette(id: string): CassetteInfo | null {
    const row = this.db.prepare('SELECT c.*, (SELECT COUNT(*) FROM recordings r WHERE r.cassette_id = c.id) AS recordings FROM cassettes c WHERE c.id = ?').get(id) as (CassetteRow & { recordings: number }) | undefined;
    return row ? cassetteFromRow(row) : null;
  }

  listCassettes(): CassetteInfo[] {
    return (this.db.prepare('SELECT c.*, (SELECT COUNT(*) FROM recordings r WHERE r.cassette_id = c.id) AS recordings FROM cassettes c ORDER BY c.created_at DESC').all() as unknown as Array<CassetteRow & { recordings: number }>).map(cassetteFromRow);
  }

  updateCassette(id: string, patch: { name?: string; description?: string | null; closed?: boolean }): CassetteInfo | null {
    const current = this.cassette(id);
    if (!current) return null;
    const closedAt = patch.closed === undefined ? current.closedAt : patch.closed ? current.closedAt ?? Date.now() : null;
    this.db.prepare('UPDATE cassettes SET name = ?, description = ?, closed_at = ?, updated_at = ? WHERE id = ?')
      .run(patch.name ?? current.name, patch.description === undefined ? current.description : patch.description, closedAt, Date.now(), id);
    this.invalidate();
    return this.cassette(id);
  }

  async deleteCassette(id: string, withRecordings: boolean): Promise<boolean> {
    if (!this.cassette(id)) return false;
    if (withRecordings) {
      const rows = this.db.prepare('SELECT id FROM recordings WHERE cassette_id = ?').all(id) as Array<{ id: string }>;
      for (const row of rows) await this.deleteRecording(row.id);
    }
    transaction(this.db, () => {
      this.db.prepare('UPDATE recordings SET cassette_id = NULL, cassette_seq = NULL WHERE cassette_id = ?').run(id);
      this.db.prepare('DELETE FROM cassettes WHERE id = ?').run(id);
    });
    this.invalidate();
    this.loaded.clear();
    return true;
  }

  // Distinct requested models per protocol, for the models endpoints.
  models(): Array<{ protocol: Protocol; model: string; createdAt: number }> {
    return this.db.prepare('SELECT protocol, model, MIN(created_at) AS createdAt FROM recordings WHERE model IS NOT NULL GROUP BY protocol, model ORDER BY model').all() as unknown as Array<{ protocol: Protocol; model: string; createdAt: number }>;
  }
}
