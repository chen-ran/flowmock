import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { getRequestListener } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { createUpgradeHandler } from './data-plane/websocket.ts';
import { createServices, type Services } from './services.ts';
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
}

export interface RunningServer {
  url: string;
  port: number;
  services: Services;
  server: Server;
  close(): Promise<void>;
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

  const listener = getRequestListener(app.fetch, {
    errorHandler: error => {
      console.error('[flowmock] unhandled request error', error);
    },
  });
  const server = createServer((request, response) => {
    void listener(request, response);
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
  return {
    url,
    port,
    services,
    server,
    close: async () => {
      clearInterval(maintenance);
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      db.close();
    },
  };
};
