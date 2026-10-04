import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { type RunningServer, startServer } from '../src/server.ts';
import { type FakeUpstream, startFakeUpstream } from './support/fake-upstream.ts';
import { readTimed } from './support/flowmock.ts';
import { seedFixture } from './support/seed.ts';
import { anthropicText, fixtureBodyText, responsesText } from '@flowmock/test-fixtures';

let dir: string;
let running: RunningServer;
let upstream: FakeUpstream | undefined;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flowmock-shutdown-'));
  running = await startServer({ dataDir: dir, port: 0, timeline: { persist: true } });
  await seedFixture(running.services, anthropicText);
  running.services.config.upsertScenario('name: slow\ntiming: { mode: synthetic, ttftMs: 400, tps: 100 }\n');
  running.services.config.upsertKey({ key: 'fm-shutdown', replay: 'slow' });
});
afterEach(async () => { await running.close(); await upstream?.close(); upstream = undefined; await rm(dir, { recursive: true, force: true }); });

const httpRequest = (key = 'fm-shutdown') => fetch(`${running.url}/v1/messages`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(anthropicText.request.body) });
const recordingTarget = async () => {
  upstream = await startFakeUpstream({ timeScale: 1 });
  running.services.config.upsertTarget({ id: 'target', baseUrl: upstream.url, headers: {} });
  running.services.config.upsertKey({ key: 'fm-shutdown-record', record: 'target' });
};
const connect = async (key: string) => {
  const socket = new WebSocket(`${running.url.replace('http', 'ws')}/v1/responses`, { headers: { authorization: `Bearer ${key}` } });
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return socket;
};

describe('graceful shutdown', () => {
  it('waits for an HTTP replay to finish and supports repeated close calls', async () => {
    const response = await httpRequest();
    const started = performance.now();
    const closed = running.close({ graceMs: 2000 });
    const result = await readTimed(response);
    expect(result.error).toBeNull();
    expect(result.text).toContain('message_stop');
    await closed;
    expect(performance.now() - started).toBeGreaterThan(300);
    await running.close();
  });

  it('cuts an HTTP stream after the grace period and persists its final trace', async () => {
    const response = await httpRequest();
    const started = performance.now();
    const reading = readTimed(response);
    await running.close({ graceMs: 50 });
    const result = await reading;
    expect(result.error).not.toBeNull();
    expect(result.text).not.toContain('message_stop');
    expect(performance.now() - started).toBeGreaterThanOrEqual(40);
    expect(performance.now() - started).toBeLessThan(1000);
    running = await startServer({ dataDir: dir, port: 0, timeline: { persist: true } });
    expect(running.services.timeline.list()[0].outcome).toBe('client_aborted');
  });

  it('drains an HTTP recording and preserves its bytes', async () => {
    await recordingTarget();
    upstream!.respondWith(() => anthropicText);
    const response = await httpRequest('fm-shutdown-record');
    const reading = readTimed(response);
    await running.close({ graceMs: 2000 });
    expect((await reading).text).toBe(fixtureBodyText(anthropicText));
    running = await startServer({ dataDir: dir, port: 0 });
    expect(running.services.corpus.list().items.some(item => item.features.outcome === 'ok')).toBe(true);
  });

  it('saves a timed-out HTTP recording as truncated before closing SQLite', async () => {
    await recordingTarget();
    upstream!.respondWith(() => anthropicText);
    const response = await httpRequest('fm-shutdown-record');
    const reading = readTimed(response);
    await running.close({ graceMs: 50 });
    await reading;
    running = await startServer({ dataDir: dir, port: 0 });
    expect(running.services.corpus.list().items.some(item => item.features.outcome === 'truncated')).toBe(true);
  });

  it('waits for an active WebSocket replay turn', async () => {
    await seedFixture(running.services, responsesText);
    const socket = await connect('fm-shutdown');
    const events: string[] = [];
    const first = new Promise<void>(resolve => socket.once('message', () => resolve()));
    socket.on('message', data => { events.push(data.toString()); });
    socket.send(JSON.stringify({ type: 'response.create', ...responsesText.request.body as object }));
    await first;
    const closing = running.close({ graceMs: 2000 });
    socket.send(JSON.stringify({ type: 'response.create', ...responsesText.request.body as object }));
    await closing;
    expect(events.some(event => event.includes('response.completed'))).toBe(true);
    expect(events.some(event => event.includes('"status":503'))).toBe(true);
  });

  it('drains a WebSocket recording through its terminal event', async () => {
    await recordingTarget();
    upstream!.respondWith(() => responsesText);
    const socket = await connect('fm-shutdown-record');
    const events: string[] = [];
    const first = new Promise<void>(resolve => socket.once('message', () => resolve()));
    socket.on('message', data => { events.push(data.toString()); });
    socket.send(JSON.stringify({ type: 'response.create', ...responsesText.request.body as object }));
    await first;
    expect(running.services.live.snapshot().activeRequests).toBe(1);
    await running.close({ graceMs: 2000 });
    expect(events.some(event => event.includes('response.completed'))).toBe(true);
    running = await startServer({ dataDir: dir, port: 0 });
    expect(running.services.corpus.list().items.some(item => item.transport === 'ws' && item.features.outcome === 'ok')).toBe(true);
  });

  it('persists a timed-out WebSocket recording and closes live admin streams', async () => {
    await recordingTarget();
    upstream!.respondWith(() => responsesText);
    const live = await fetch(`${running.url}/api/live`);
    const reader = live.body!.getReader();
    await reader.read();
    const socket = await connect('fm-shutdown-record');
    const first = new Promise<void>(resolve => socket.once('message', () => resolve()));
    socket.send(JSON.stringify({ type: 'response.create', ...responsesText.request.body as object }));
    await first;
    await running.close({ graceMs: 50 });
    running = await startServer({ dataDir: dir, port: 0 });
    expect(running.services.corpus.list().items.some(item => item.transport === 'ws' && item.features.outcome === 'truncated')).toBe(true);
    await reader.cancel().catch(() => {});
  });
});
