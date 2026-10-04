import type { DatabaseSync } from 'node:sqlite';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { compileTransforms, DEFAULT_SCENARIO, type Scenario, scenarioSchema } from '@flowmock/core';

export interface Target {
  id: string;
  name: string;
  // Upstream origin plus an optional path prefix; the client's request path
  // is appended to it.
  baseUrl: string;
  // Sent upstream in place of the client's credentials.
  headers: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface KeyBinding {
  key: string;
  name: string;
  mode: 'record' | 'replay';
  targetId: string | null;
  scenario: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredScenario {
  name: string;
  source: string;
  scenario: Scenario;
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export class ConfigError extends Error {
  readonly status: number;

  constructor(message: string, status = 400, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

export const targetInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'use letters, digits, dot, underscore or dash'),
  name: z.string().optional(),
  baseUrl: z.url({ protocol: /^https?$/ }),
  headers: z.record(z.string(), z.string()).default({}),
}).strict();

export const keyInputSchema = z.object({
  key: z.string().min(8, 'mock keys need at least 8 characters'),
  name: z.string().optional(),
  record: z.string().optional(),
  replay: z.string().optional(),
}).strict().refine(value => (value.record === undefined) !== (value.replay === undefined), { message: 'bind a key to exactly one of record: <target> or replay: <scenario>' });

export type TargetInput = z.input<typeof targetInputSchema>;
export type KeyInput = z.input<typeof keyInputSchema>;

// Parses scenario source (YAML or JSON) and validates it, including any extra
// transforms' configuration.
export const parseScenarioSource = (source: string, expectedName?: string): Scenario => {
  let value: unknown;
  try {
    value = parseYaml(source);
  } catch (error) {
    throw new ConfigError(`scenario is not valid YAML: ${error instanceof Error ? error.message : String(error)}`, 400, { cause: error });
  }
  if (expectedName !== undefined && value !== null && typeof value === 'object' && !('name' in value)) value = { ...value, name: expectedName };
  const parsed = scenarioSchema.safeParse(value);
  if (!parsed.success) throw new ConfigError(`invalid scenario: ${z.prettifyError(parsed.error)}`, 400, { cause: parsed.error });
  if (expectedName !== undefined && parsed.data.name !== expectedName) throw new ConfigError(`scenario name ${parsed.data.name} does not match ${expectedName}`);
  try {
    compileTransforms(parsed.data.transforms);
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error), 400, { cause: error });
  }
  return parsed.data;
};

interface TargetRow { id: string; name: string; base_url: string; headers: string; created_at: number; updated_at: number }
interface ScenarioRow { name: string; source: string; created_at: number; updated_at: number }
interface KeyRow { key: string; name: string; mode: 'record' | 'replay'; target_id: string | null; scenario: string | null; created_at: number; updated_at: number }

const targetFromRow = (row: TargetRow): Target => ({ id: row.id, name: row.name, baseUrl: row.base_url, headers: JSON.parse(row.headers) as Record<string, string>, createdAt: row.created_at, updatedAt: row.updated_at });
const keyFromRow = (row: KeyRow): KeyBinding => ({ key: row.key, name: row.name, mode: row.mode, targetId: row.target_id, scenario: row.scenario, createdAt: row.created_at, updatedAt: row.updated_at });

const DEFAULT_STORED_SCENARIO: StoredScenario = {
  name: DEFAULT_SCENARIO.name,
  source: 'name: default\n',
  scenario: DEFAULT_SCENARIO,
  builtIn: true,
  createdAt: 0,
  updatedAt: 0,
};

export class ConfigStore {
  private readonly db: DatabaseSync;
  private scenarioCache: Map<string, StoredScenario> | null = null;
  private keyCache: Map<string, KeyBinding> | null = null;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // ── Targets ──

  upsertTarget(input: TargetInput, now = Date.now()): Target {
    const parsed = targetInputSchema.safeParse(input);
    if (!parsed.success) throw new ConfigError(`invalid target: ${z.prettifyError(parsed.error)}`);
    const { id, name, baseUrl, headers } = parsed.data;
    this.db.prepare(`INSERT INTO targets (id, name, base_url, headers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, base_url = excluded.base_url, headers = excluded.headers, updated_at = excluded.updated_at`)
      .run(id, name ?? id, baseUrl.replace(/\/+$/, ''), JSON.stringify(headers), now, now);
    return this.getTarget(id)!;
  }

  getTarget(id: string): Target | null {
    const row = this.db.prepare('SELECT * FROM targets WHERE id = ?').get(id) as TargetRow | undefined;
    return row ? targetFromRow(row) : null;
  }

  listTargets(): Target[] {
    return (this.db.prepare('SELECT * FROM targets ORDER BY id').all() as unknown as TargetRow[]).map(targetFromRow);
  }

  deleteTarget(id: string): boolean {
    const bound = this.db.prepare('SELECT COUNT(*) AS count FROM api_keys WHERE target_id = ?').get(id) as { count: number };
    if (bound.count > 0) throw new ConfigError(`target ${id} is bound to ${bound.count} key(s)`, 409);
    return Number(this.db.prepare('DELETE FROM targets WHERE id = ?').run(id).changes) > 0;
  }

  // ── Scenarios ──

  private scenarios(): Map<string, StoredScenario> {
    if (!this.scenarioCache) {
      const cache = new Map<string, StoredScenario>([[DEFAULT_STORED_SCENARIO.name, DEFAULT_STORED_SCENARIO]]);
      for (const row of this.db.prepare('SELECT * FROM scenarios').all() as unknown as ScenarioRow[]) {
        cache.set(row.name, { name: row.name, source: row.source, scenario: parseScenarioSource(row.source, row.name), builtIn: false, createdAt: row.created_at, updatedAt: row.updated_at });
      }
      this.scenarioCache = cache;
    }
    return this.scenarioCache;
  }

  upsertScenario(source: string, expectedName?: string, now = Date.now()): StoredScenario {
    const scenario = parseScenarioSource(source, expectedName);
    this.db.prepare(`INSERT INTO scenarios (name, source, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at`)
      .run(scenario.name, source, now, now);
    this.scenarioCache = null;
    return this.getScenario(scenario.name)!;
  }

  getScenario(name: string): StoredScenario | null {
    return this.scenarios().get(name) ?? null;
  }

  listScenarios(): StoredScenario[] {
    return [...this.scenarios().values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  deleteScenario(name: string): boolean {
    const bound = this.db.prepare('SELECT COUNT(*) AS count FROM api_keys WHERE scenario = ?').get(name) as { count: number };
    if (bound.count > 0 && name !== DEFAULT_SCENARIO.name) throw new ConfigError(`scenario ${name} is bound to ${bound.count} key(s)`, 409);
    const removed = Number(this.db.prepare('DELETE FROM scenarios WHERE name = ?').run(name).changes) > 0;
    this.scenarioCache = null;
    return removed;
  }

  // ── Keys ──

  private keys(): Map<string, KeyBinding> {
    this.keyCache ??= new Map((this.db.prepare('SELECT * FROM api_keys').all() as unknown as KeyRow[]).map(row => [row.key, keyFromRow(row)]));
    return this.keyCache;
  }

  upsertKey(input: KeyInput, now = Date.now()): KeyBinding {
    const parsed = keyInputSchema.safeParse(input);
    if (!parsed.success) throw new ConfigError(`invalid key: ${z.prettifyError(parsed.error)}`);
    const { key, name, record, replay } = parsed.data;
    if (record !== undefined && !this.getTarget(record)) throw new ConfigError(`record target ${record} does not exist`, 404);
    if (replay !== undefined && !this.getScenario(replay)) throw new ConfigError(`scenario ${replay} does not exist`, 404);
    this.db.prepare(`INSERT INTO api_keys (key, name, mode, target_id, scenario, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET name = excluded.name, mode = excluded.mode, target_id = excluded.target_id, scenario = excluded.scenario, updated_at = excluded.updated_at`)
      .run(key, name ?? `${record !== undefined ? 'record' : 'replay'}-${key.slice(-4)}`, record !== undefined ? 'record' : 'replay', record ?? null, replay ?? null, now, now);
    this.keyCache = null;
    return this.getKey(key)!;
  }

  getKey(key: string): KeyBinding | null {
    return this.keys().get(key) ?? null;
  }

  listKeys(): KeyBinding[] {
    return [...this.keys().values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  deleteKey(key: string): boolean {
    const removed = Number(this.db.prepare('DELETE FROM api_keys WHERE key = ?').run(key).changes) > 0;
    this.keyCache = null;
    return removed;
  }
}

// Masks secrets in target headers for API responses.
export const maskHeaders = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`]));
