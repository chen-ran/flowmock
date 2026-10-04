import { describe, expect, it } from 'vitest';

import { applyMigrations, openDatabase } from '../../src/store/database.ts';

describe('migrations', () => {
  it('apply once and are recorded', () => {
    const db = openDatabase(':memory:');
    applyMigrations(db);
    const applied = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>;
    expect(applied.map(row => row.name)).toEqual(['0001_init.sql']);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
    expect(tables).toEqual(expect.arrayContaining(['api_keys', 'cassettes', 'recordings', 'scenarios', 'targets']));
    db.close();
  });
});
