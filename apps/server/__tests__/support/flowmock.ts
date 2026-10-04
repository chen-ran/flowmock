import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type RunningServer, startServer } from '../../src/server.ts';

export interface TestServer extends RunningServer {
  admin(path: string, init?: RequestInit): Promise<Response>;
  stop(): Promise<void>;
}

export const ADMIN_KEY = 'test-admin-key';

export const startTestServer = async (options: { cassetteIdleMs?: number } = {}): Promise<TestServer> => {
  const dataDir = await mkdtemp(join(tmpdir(), 'flowmock-test-'));
  const running = await startServer({ port: 0, dataDir, databasePath: ':memory:', adminKey: ADMIN_KEY, cassetteIdleMs: options.cassetteIdleMs });
  return {
    ...running,
    admin: async (path, init = {}) => await fetch(`${running.url}/api${path}`, { ...init, headers: { authorization: `Bearer ${ADMIN_KEY}`, ...(init.body !== undefined && typeof init.body === 'string' && init.body.startsWith('{') ? { 'content-type': 'application/json' } : {}), ...init.headers } }),
    stop: async () => {
      await running.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
};

// Reads a streamed body chunk by chunk with the arrival time of each read.
export const readTimed = async (response: Response): Promise<{ text: string; reads: Array<{ at: number; bytes: number }>; error: Error | null }> => {
  const started = performance.now();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const reads: Array<{ at: number; bytes: number }> = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reads.push({ at: performance.now() - started, bytes: value.byteLength });
      text += decoder.decode(value, { stream: true });
    }
    return { text: text + decoder.decode(), reads, error: null };
  } catch (error) {
    return { text, reads, error: error as Error };
  }
};
