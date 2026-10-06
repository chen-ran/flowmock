import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type RunningServer, startServer } from '../../src/server.ts';
import { FLOWMOCK_VERSION } from '../../src/version.ts';

const withServer = async (options: Partial<Parameters<typeof startServer>[0]>, run: (server: RunningServer) => Promise<void>) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'flowmock-settings-'));
  const server = await startServer({ dataDir, port: 0, databasePath: ':memory:', ...options });
  try {
    await run(server);
  } finally {
    await server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
};

describe('GET /api/settings', () => {
  it('reports the runtime settings the management app shows', async () => {
    await withServer({ adminKey: 'admin', timeline: { persist: true, retainDays: 3, maxEntries: 50 } }, async server => {
      expect((await fetch(`${server.url}/api/settings`)).status).toBe(401);
      const response = await fetch(`${server.url}/api/settings`, { headers: { authorization: 'Bearer admin' } });
      expect(await response.json()).toEqual({ version: FLOWMOCK_VERSION, adminKey: true, timeline: { persist: true, retainDays: 3, maxEntries: 50 } });
    });
  });

  it('reports an in-memory timeline and an open admin API', async () => {
    await withServer({}, async server => {
      const response = await fetch(`${server.url}/api/settings`);
      expect(await response.json()).toEqual({ version: FLOWMOCK_VERSION, adminKey: false, timeline: { persist: false } });
    });
  });
});
