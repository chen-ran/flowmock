import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { WebSocketServer } from 'ws';

import { type ExchangeFixture, type FixtureChunk } from '@flowmock/test-fixtures';

export interface UpstreamRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: string;
}

export interface FakeUpstream {
  url: string;
  requests: UpstreamRequest[];
  // Selects the fixture to answer the next request with.
  respondWith(choose: (request: UpstreamRequest) => ExchangeFixture): void;
  close(): Promise<void>;
}

// Plays fixture chunks with their recorded spacing, scaled by `timeScale`,
// the way a real upstream would stream them.
const play = async (chunks: readonly FixtureChunk[], headersAt: number, timeScale: number, write: (text: string) => void): Promise<void> => {
  let previous = headersAt;
  for (const chunk of chunks) {
    const wait = (chunk.t - previous) * timeScale;
    if (wait > 0) await sleep(wait);
    previous = chunk.t;
    write(chunk.text);
  }
};

export const startFakeUpstream = async (options: { timeScale?: number } = {}): Promise<FakeUpstream> => {
  const timeScale = options.timeScale ?? 0.05;
  const requests: UpstreamRequest[] = [];
  let choose: (request: UpstreamRequest) => ExchangeFixture = () => {
    throw new Error('fake upstream has no fixture configured');
  };

  const server: Server = createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on('data', part => parts.push(part as Buffer));
    req.on('end', () => {
      const request = { method: req.method ?? 'GET', path: req.url ?? '/', headers: req.headers, body: Buffer.concat(parts).toString('utf8') };
      requests.push(request);
      const fixture = choose(request);
      void (async () => {
        await sleep(fixture.response.headersAt * timeScale);
        res.writeHead(fixture.response.status, fixture.response.headers);
        res.flushHeaders();
        await play(fixture.response.chunks, fixture.response.headersAt, timeScale, text => res.write(text));
        res.end();
      })();
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    socket.on('message', data => {
      const request = { method: 'WS', path: req.url ?? '/', headers: req.headers, body: data.toString() };
      requests.push(request);
      const fixture = choose(request);
      // A Responses WebSocket carries each SSE event's JSON as one message.
      const messages = fixture.response.chunks.flatMap(chunk => [...chunk.text.matchAll(/^data: (.*)$/gm)].map(match => ({ t: chunk.t, text: match[1] })));
      void play(messages, fixture.response.headersAt, timeScale, text => socket.send(text));
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respondWith: next => { choose = next; },
    close: async () => {
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
};
