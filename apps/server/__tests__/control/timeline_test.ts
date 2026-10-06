import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type RunningServer, startServer } from '../../src/server.ts';
import { seedFixture } from '../support/seed.ts';
import { timelineEntry } from '../support/timeline.ts';
import { anthropicText } from '@flowmock/test-fixtures';

describe('persistent request timeline', () => {
  it('keeps real replays and sessions after restart and pages beyond the hot cache', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'flowmock-timeline-'));
    let running: RunningServer | undefined;
    try {
      const options = { dataDir, port: 0, adminKey: 'admin', timeline: { persist: true, retainDays: 7, maxEntries: 100 }, timelineSize: 1 };
      running = await startServer(options);
      await seedFixture(running.services, anthropicText);
      running.services.config.upsertKey({ key: 'fm-persistent', name: 'persistent', replay: 'default' });
      running.services.config.upsertScenario('name: fast\ntiming: { mode: recorded, scale: 0.001 }');
      const { token } = running.services.adminSessions.create();
      const ids: string[] = [];
      for (let index = 0; index < 3; index++) {
        const response = await fetch(`${running.url}/v1/messages`, { method: 'POST', headers: { authorization: 'Bearer fm-persistent', 'x-flowmock-scenario': 'fast', 'content-type': 'application/json' }, body: JSON.stringify(anthropicText.request.body) });
        await response.text();
        ids.unshift(response.headers.get('x-flowmock-request-id')!);
      }
      await running.close();
      running = await startServer(options);
      const headers = { 'x-flowmock-admin-session': token };
      const list = await (await fetch(`${running.url}/api/requests?limit=2`, { headers })).json() as { items: Array<{ id: string }> };
      expect(list.items.map(entry => entry.id)).toEqual(ids.slice(0, 2));
      const next = await (await fetch(`${running.url}/api/requests?before=${ids[1]}&protocol=anthropic-messages&outcome=completed&key=persistent`, { headers })).json() as { items: Array<{ id: string }> };
      expect(next.items.map(entry => entry.id)).toEqual(ids.slice(2));
      expect((await fetch(`${running.url}/api/requests/${ids[2]}`, { headers })).status).toBe(200);
      expect((await fetch(`${running.url}/api/requests?limit=NaN`, { headers })).status).toBe(400);
    } finally { await running?.close(); await rm(dataDir, { recursive: true, force: true }); }
  });

  it('filters the hot cache by status class', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'flowmock-status-'));
    const running = await startServer({ dataDir, port: 0 });
    try {
      running.services.timeline.add(timelineEntry('req_ok', 1, { status: 200 }));
      running.services.timeline.add(timelineEntry('req_limited', 2, { status: 429 }));
      running.services.timeline.add(timelineEntry('req_broken', 3, { status: 503 }));
      const list = async (query: string) => ((await (await fetch(`${running.url}/api/requests?${query}`)).json()) as { items: Array<{ id: string }> }).items.map(entry => entry.id);
      expect(await list('status=4xx')).toEqual(['req_limited']);
      expect(await list('status=5xx')).toEqual(['req_broken']);
      expect((await fetch(`${running.url}/api/requests?status=429`)).status).toBe(400);
    } finally { await running.close(); await rm(dataDir, { recursive: true, force: true }); }
  });

  it('leaves persistence off by default', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'flowmock-no-timeline-'));
    let running = await startServer({ dataDir, port: 0 });
    try {
      running.services.timeline.add(timelineEntry('req_test', Date.now()));
      expect(running.services.db.prepare('SELECT COUNT(*) AS n FROM request_traces').get()).toMatchObject({ n: 0 });
      await running.close();
      running = await startServer({ dataDir, port: 0 });
      expect(running.services.timeline.list()).toEqual([]);
    } finally { await running.close(); await rm(dataDir, { recursive: true, force: true }); }
  });
});
