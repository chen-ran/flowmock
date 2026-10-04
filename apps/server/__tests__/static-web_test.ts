import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type RunningServer, startServer } from '../src/server.ts';

let dir: string;
let running: RunningServer;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flowmock-web-'));
  await mkdir(join(dir, 'web', 'assets'), { recursive: true });
  await writeFile(join(dir, 'web', 'index.html'), '<html>FlowMock dashboard</html>');
  await writeFile(join(dir, 'web', 'assets', 'app-abc.js'), 'console.log("FlowMock")');
  await writeFile(join(dir, 'secret'), 'secret');
  await symlink(join(dir, 'secret'), join(dir, 'web', 'assets', 'leak.txt'));
  running = await startServer({ port: 0, dataDir: join(dir, 'data'), webDistDir: join(dir, 'web') });
});
afterEach(async () => { await running.close(); await rm(dir, { recursive: true, force: true }); });

describe('static dashboard hosting', () => {
  it('serves SPA routes, immutable assets, HEAD and conditional requests', async () => {
    expect(await (await fetch(`${running.url}/`)).text()).toContain('FlowMock dashboard');
    expect(await (await fetch(`${running.url}/scenarios/x`)).text()).toContain('FlowMock dashboard');
    const response = await fetch(`${running.url}/assets/app-abc.js`);
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('content-type')).toContain('text/javascript');
    const cached = await fetch(`${running.url}/assets/app-abc.js`, { headers: { 'if-none-match': response.headers.get('etag')! } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
    const head = await fetch(`${running.url}/scenarios/x`, { method: 'HEAD' });
    expect(head.headers.get('cache-control')).toBe('no-cache');
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(0);
    expect(await head.text()).toBe('');
    expect((await fetch(`${running.url}/assets/missing.js`)).status).toBe(404);
  });

  it('keeps every API prefix under Hono, including encoded paths and 404s', async () => {
    for (const path of ['/api/missing', '/metrics/missing', '/v1/unknown', '/v1beta/unknown', '/messages/missing', '/chat/completions/missing', '/responses/missing', '/models/missing', '/%61pi/missing']) {
      const response = await fetch(`${running.url}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });

  it('rejects traversal and symlink escapes', async () => {
    for (const path of ['/%2e%2e%2fsecret', '/assets/leak.txt']) expect((await fetch(`${running.url}${path}`)).status).toBe(404);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = get(`${running.url}`, { path: '/%2e%2e/secret' }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    expect(status).toBe(404);
  });

  it('reports a missing build with 503 while APIs remain available', async () => {
    await rm(join(dir, 'web'), { recursive: true });
    const response = await fetch(`${running.url}/`);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('build');
    expect((await fetch(`${running.url}/api/health`)).status).toBe(200);
  });
});
