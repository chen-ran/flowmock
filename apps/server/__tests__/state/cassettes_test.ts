import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CassetteTracker } from '../../src/state/cassettes.ts';
import { ChunkFiles } from '../../src/store/chunk-files.ts';
import { SqliteCorpus } from '../../src/store/corpus-store.ts';
import { openDatabase } from '../../src/store/database.ts';

let dir: string;
let corpus: SqliteCorpus;
let close: () => void;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flowmock-cassettes-'));
  const db = openDatabase(':memory:');
  close = () => db.close();
  corpus = new SqliteCorpus(db, new ChunkFiles(dir));
});
afterEach(async () => {
  close();
  await rm(dir, { recursive: true, force: true });
});

const at = Date.UTC(2026, 9, 7, 0, 34, 1);
const slot = { keyName: 'deepseek record', key: 'fm-record-deepseek', targetId: 'deepseek', sessionId: 'chat-1' };

describe('cassette tracker', () => {
  it('names a cassette by its key and the moment it opened, in a zone the name states', () => {
    const tracker = new CassetteTracker(corpus);
    const { cassetteId } = tracker.claim(slot, at);
    expect(corpus.cassette(cassetteId)?.name).toBe('deepseek record 2026-10-07 00:34:01 UTC');
  });

  it('keeps one session in one cassette until it idles', () => {
    const tracker = new CassetteTracker(corpus, 60_000);
    const first = tracker.claim(slot, at);
    const second = tracker.claim(slot, at + 30_000);
    const third = tracker.claim(slot, at + 30_000 + 60_001);
    expect(second).toEqual({ cassetteId: first.cassetteId, seq: 2 });
    expect(third.cassetteId).not.toBe(first.cassetteId);
    expect(third.seq).toBe(1);
  });
});
