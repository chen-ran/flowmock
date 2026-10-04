import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

// Opens (or creates) the SQLite database and applies pending migrations.
// `:memory:` gives tests an isolated database.
export const openDatabase = (path: string): DatabaseSync => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  applyMigrations(db);
  return db;
};

// Adapted from Floway apps/platform-node/src/migrate.ts (MIT). See NOTICE.md.
//
// Each file runs inside its own transaction and is recorded in `_migrations`,
// so reruns are no-ops and a failing file leaves no partial schema behind.
export const applyMigrations = (db: DatabaseSync, dir: string = MIGRATIONS_DIR): void => {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set((db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>).map(row => row.name));
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(dir, file), 'utf8'));
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // SQLite already rolled back on a hard error; keep the original one.
      }
      throw error;
    }
  }
};

// Runs `body` in a transaction. node:sqlite is synchronous, so nothing else
// can interleave between BEGIN and COMMIT.
export const transaction = <T>(db: DatabaseSync, body: () => T): T => {
  db.exec('BEGIN');
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Already rolled back.
    }
    throw error;
  }
};
