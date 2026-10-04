import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { getRequestListener } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { createUpgradeHandler } from './data-plane/websocket.ts';
import { createServices, type Services } from './services.ts';
import { InflightTracker } from './state/inflight.ts';
import { createNodeFetchHandler, nodeWebDistDir } from './static-web.ts';
import { openDatabase } from './store/database.ts';
import type { TimelineOptions } from './store/trace-store.ts';
import type { Clock } from '@flowmock/core';

export interface StartOptions {
  host?: string;
  port?: number;
  // Holds `flowmock.db` and the `chunks/` directory.
  dataDir: string;
  // `:memory:` keeps the database in memory; chunks still go to dataDir.
  databasePath?: string;
  adminKey?: string | null;
  clock?: Clock;
  cassetteIdleMs?: number;
  timelineSize?: number;
  timeline?: TimelineOptions;
  webDistDir?: string;
}

export interface RunningServer {
  url: string;
  port: number;
  services: Services;
  server: Server;
  close(options?: { graceMs?: number }): Promise<void>;
}

const isLoopback = (host: string): boolean => host === '127.0.0.1' || host === '::1' || host === 'localhost';

export const startServer = async (options: StartOptions): Promise<RunningServer> => {
  const host = options.host ?? '127.0.0.1';
  if (!isLoopback(host) && !options.adminKey) {
    throw new Error(`Refusing to listen on ${host} without FLOWMOCK_ADMIN_KEY: the control plane would be open to the network.`);
  }
  const db = openDatabase(options.databasePath ?? join(options.dataDir, 'flowmock.db'));
  const services = createServices({ db, chunkDir: join(options.dataDir, 'chunks'), adminKey: options.adminKey ?? null, clock: options.clock, cassetteIdleMs: options.cassetteIdleMs, timeline: options.timeline, timelineSize: options.timelineSize });
  services.traces?.prune();
  const { app } = createApp(services);

  const listener = getRequestListener(createNodeFetchHandler(app.fetch, { distDir: options.webDistDir ?? nodeWebDistDir() }), {
    errorHandler: error => {
      console.error('[flowmock] unhandled request error', error);
    },
  });
  const httpWork = new InflightTracker();
  const server = createServer((request, response) => {
    const work = listener(request, response);
    const pathname = new URL(request.url ?? '/', 'http://flowmock.invalid').pathname;
    if (request.method !== 'GET' || !['/api/live', '/api/requests/stream'].includes(pathname)) void httpWork.track(work);
    void work.catch(error => console.error('[flowmock] request failed', error));
  });
  // Long reasoning streams can stay silent for minutes; Node's default
  // request timeout would cut them.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  server.on('upgrade', createUpgradeHandler(services, wss));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8787, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
  const maintenance = setInterval(() => { services.traces?.prune(); services.adminSessions.purgeExpired(); }, 10 * 60_000);
  maintenance.unref();
  let closing: Promise<void> | undefined;
  return {
    url,
    port,
    services,
    server,
    close: ({ graceMs = 10_000 } = {}) => closing ??= (async () => {
      const started = performance.now();
      services.stopping = true;
      clearInterval(maintenance);
      const serverClosed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      services.controlStreams.abort();
      const results = await Promise.all([services.inflight.drain(graceMs), httpWork.drain(graceMs)]);
      if (results.some(result => !result.drained)) services.shutdown.abort(new Error('FlowMock shutdown grace period expired'));
      const drained = results.every(result => result.drained);
      for (const client of wss.clients) {
        if (drained) client.close(1001, 'FlowMock shutdown');
        else client.terminate();
      }
      // A close handshake lets the peer consume the terminal message. Bound
      // it by the remaining grace period for unresponsive peers.
      const websocketDeadline = setTimeout(() => { for (const client of wss.clients) client.terminate(); }, Math.max(0, graceMs - (performance.now() - started)));
      const websocketsClosed = new Promise<void>(resolve => wss.close(() => resolve()));
      server.closeAllConnections();
      // Aborted recordings still write their partial exchange. Keep SQLite
      // open until those handlers and WebSocket close callbacks have settled.
      await Promise.all([serverClosed, websocketsClosed]);
      clearTimeout(websocketDeadline);
      await Promise.all([services.inflight.drain(Infinity), httpWork.drain(Infinity)]);
      db.close();
    })(),
  };
};
