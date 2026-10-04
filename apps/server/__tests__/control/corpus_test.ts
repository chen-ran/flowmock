import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChunkFiles } from '../../src/store/chunk-files.ts';
import { startTestServer, type TestServer } from '../support/flowmock.ts';
import { seedFixture } from '../support/seed.ts';
import { anthropicText, chatText, responsesFunctionCall } from '@flowmock/test-fixtures';

let flowmock: TestServer;
beforeEach(async () => {
  flowmock = await startTestServer();
  for (const fixture of [anthropicText, chatText, responsesFunctionCall]) await seedFixture(flowmock.services, fixture);
});
afterEach(async () => { await flowmock.stop(); });

describe('corpus management', () => {
  it('does not repopulate the replay cache when a pending load finishes after deletion', async () => {
    const id = flowmock.services.corpus.list().items[0].id;
    let loaded!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { loaded = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const originalRead = ChunkFiles.prototype.read;
    const read = vi.spyOn(ChunkFiles.prototype, 'read').mockImplementation(async function (this: ChunkFiles, path) {
      const chunks = await originalRead.call(this, path);
      loaded();
      await blocked;
      return chunks;
    });
    try {
      const loading = flowmock.services.corpus.getRecording(id);
      await ready;
      await flowmock.services.corpus.deleteRecordings([id]);
      release();
      expect((await loading)?.id ?? null).toBeNull();
      expect(await flowmock.services.corpus.getRecording(id)).toBeNull();
    } finally { release(); read.mockRestore(); }
  });
  it('rolls back every row on a database failure and preserves the original file error', async () => {
    const ids = flowmock.services.corpus.list().items;
    const anthropic = ids.find(item => item.protocol === 'anthropic-messages')!.id;
    const chat = ids.find(item => item.protocol === 'openai-chat-completions')!.id;
    flowmock.services.db.exec("CREATE TEMP TRIGGER reject_delete BEFORE DELETE ON recordings WHEN OLD.protocol = 'openai-chat-completions' BEGIN SELECT RAISE(ABORT, 'blocked delete'); END");
    await expect(flowmock.services.corpus.deleteRecordings([anthropic, chat])).rejects.toThrow('blocked delete');
    expect(flowmock.services.corpus.list().total).toBe(3);
    flowmock.services.db.exec('DROP TRIGGER reject_delete');
    await flowmock.services.corpus.getRecording(anthropic);
    await flowmock.services.corpus.listCandidates('anthropic-messages');
    const error = new Error('file removal failed');
    const remove = vi.spyOn(ChunkFiles.prototype, 'remove').mockRejectedValue(error);
    try {
      await expect(flowmock.services.corpus.deleteRecordings([anthropic])).rejects.toBe(error);
      expect(await flowmock.services.corpus.getRecording(anthropic)).toBeNull();
      expect(await flowmock.services.corpus.listCandidates('anthropic-messages')).toEqual([]);
    } finally { remove.mockRestore(); }
  });
  it('searches request bodies case-insensitively and pages stable timestamp ties', async () => {
    const found = await (await flowmock.admin('/recordings?q=WEATHER')).json() as { total: number; items: Array<{ protocol: string }> };
    expect(found.total).toBe(1);
    expect(found.items[0].protocol).toBe('openai-responses');
    expect((await (await flowmock.admin('/recordings?q=%25')).json() as { total: number }).total).toBe(0);
    expect((await (await flowmock.admin('/recordings?q=%2Fv1%2Fmessages')).json() as { total: number }).total).toBe(0);
    flowmock.services.db.prepare('UPDATE recordings SET created_at = 1000').run();
    const all = flowmock.services.corpus.list().items.map(item => item.id);
    const first = await (await flowmock.admin('/recordings?limit=2')).json() as { items: Array<{ id: string }> };
    expect(first.items.map(item => item.id)).toEqual(all.slice(0, 2));
    const next = await (await flowmock.admin(`/recordings?before=${all[1]}`)).json() as { items: Array<{ id: string }> };
    expect(next.items.map(item => item.id)).toEqual(all.slice(2));
    expect((await flowmock.admin('/recordings?limit=-1')).status).toBe(400);
    expect((await flowmock.admin('/recordings?protocol=invalid')).status).toBe(400);
  });

  it('reports grouped counts and bytes and bulk-deletes unique records and their chunks', async () => {
    const items = flowmock.services.corpus.list().items;
    const deletedFiles = items.slice(0, 2).map(item => (flowmock.services.db.prepare('SELECT chunk_file FROM recordings WHERE id = ?').get(item.id) as { chunk_file: string }).chunk_file);
    const recordings = await Promise.all(items.map(async item => await flowmock.services.corpus.getRecording(item.id)));
    const bytes = recordings.reduce((sum, recording) => sum + recording!.response.chunks.reduce((size, chunk) => size + chunk.bytes.byteLength, 0), 0);
    const stats = await (await flowmock.admin('/stats')).json() as { recordings: number; bytes: number; byProtocol: Array<{ protocol: string; recordings: number; bytes: number }>; byOutcome: Array<{ outcome: string; recordings: number }>; byModel: Array<{ model: string; recordings: number }> };
    expect(stats.recordings).toBe(3);
    expect(stats.bytes).toBe(bytes);
    expect(stats.byProtocol.map(row => row.recordings)).toEqual([1, 1, 1]);
    expect(stats.byOutcome).toEqual([expect.objectContaining({ outcome: 'ok', recordings: 3 })]);
    expect(stats.byModel).toHaveLength(3);
    const response = await flowmock.admin('/recordings/delete', { method: 'POST', body: JSON.stringify({ ids: [items[0].id, items[0].id, items[1].id, 'missing'] }) });
    expect(await response.json()).toEqual({ deleted: 2 });
    expect(await flowmock.services.corpus.getRecording(items[0].id)).toBeNull();
    expect(flowmock.services.corpus.list().total).toBe(1);
    for (const file of deletedFiles) await expect(access(join(flowmock.dataDir, 'chunks', file))).rejects.toMatchObject({ code: 'ENOENT' });
    const row = flowmock.services.db.prepare('SELECT chunk_file FROM recordings WHERE id = ?').get(items[2].id) as { chunk_file: string };
    expect(await (await flowmock.admin('/stats')).json()).toMatchObject({ recordings: 1 });
    expect(row.chunk_file).toContain(items[2].id);
    expect((await flowmock.admin('/recordings/delete', { method: 'POST', body: '{"ids":[]}' })).status).toBe(400);
  });
});
