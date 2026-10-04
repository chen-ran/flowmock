import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { readTimed, startTestServer, type TestServer } from './support/flowmock.ts';
import { seedFixture } from './support/seed.ts';
import { anthropicText, fixtureBodyText } from '@flowmock/test-fixtures';

let flowmock: TestServer;

const useScenario = (key: string, scenario: Record<string, unknown>): string => {
  flowmock.services.config.upsertScenario(stringify(scenario));
  flowmock.services.config.upsertKey({ key, replay: scenario.name as string });
  return key;
};

const request = (key: string) => fetch(`${flowmock.url}/v1/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key },
  body: JSON.stringify(anthropicText.request.body),
});

// Arrival time of the first read containing `needle`, relative to the start
// of the read loop.
const arrivalOf = (reads: Array<{ at: number; text: string }>, needle: string): number | null => {
  let seen = '';
  for (const read of reads) {
    seen += read.text;
    if (seen.includes(needle)) return read.at;
  }
  return null;
};

const timedRequest = async (key: string) => {
  const started = performance.now();
  const response = await request(key);
  const headersAt = performance.now() - started;
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const reads: Array<{ at: number; text: string; bytes: number }> = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    reads.push({ at: performance.now() - started, text: decoder.decode(value, { stream: true }), bytes: value.byteLength });
  }
  return { headersAt, reads, text: reads.map(read => read.text).join('') };
};

beforeAll(async () => {
  flowmock = await startTestServer();
  await seedFixture(flowmock.services, anthropicText);
});

afterAll(async () => {
  await flowmock.stop();
});

describe('timing on the wire', () => {
  it('reproduces a synthetic TTFT and decode speed', async () => {
    const key = useScenario('fm-time-synthetic', { name: 'ttft-300-tps-40', timing: { mode: 'synthetic', ttftMs: 300, tps: 40 } });
    const { reads } = await timedRequest(key);
    const firstText = arrivalOf(reads, '"Hello"')!;
    const lastText = arrivalOf(reads, '" today?"')!;
    expect(firstText).toBeGreaterThanOrEqual(295);
    expect(firstText).toBeLessThan(400);
    // 12 tokens over 32 characters: "Hello" carries 1.875, the rest 10.125.
    const expectedSpan = (10.125 / 40) * 1000;
    expect(lastText - firstText).toBeGreaterThan(expectedSpan * 0.85);
    expect(lastText - firstText).toBeLessThan(expectedSpan * 1.25);

    const [entry] = (await (await flowmock.admin('/requests?limit=1')).json() as { items: Array<{ result: { achievedTtftMs: number; achievedTps: number } }> }).items;
    expect(entry.result.achievedTtftMs).toBeGreaterThanOrEqual(299);
    expect(entry.result.achievedTtftMs).toBeLessThan(340);
    expect(entry.result.achievedTps).toBeGreaterThan(40 * 0.85);
    expect(entry.result.achievedTps).toBeLessThan(40 * 1.15);
  });

  it('scales recorded intervals', async () => {
    const key = useScenario('fm-time-scaled', { name: 'scaled', timing: { mode: 'recorded', scale: 0.2 } });
    const { headersAt, reads } = await timedRequest(key);
    // Headers at 405ms and the first delta at 905ms in the recording.
    expect(headersAt).toBeGreaterThanOrEqual(80);
    expect(arrivalOf(reads, '"Hello"')!).toBeGreaterThanOrEqual(180);
    expect(arrivalOf(reads, '"Hello"')!).toBeLessThan(280);
  });

  it('delays headers by network latency', async () => {
    const key = useScenario('fm-time-latency', { name: 'latency', timing: { mode: 'synthetic', ttftMs: 0, tps: 10_000 }, network: { latencyMs: 150, headersDelayMs: 100 } });
    const { headersAt } = await timedRequest(key);
    expect(headersAt).toBeGreaterThanOrEqual(245);
  });

  it('fragments the body into tiny writes without changing a byte', async () => {
    const key = useScenario('fm-time-fragments', {
      name: 'fragments',
      rewrite: { ids: false, created: false },
      timing: { mode: 'synthetic', ttftMs: 0, tps: 100_000 },
      network: { fragmentation: { maxBytes: 3, gapMs: 2 } },
    });
    const { reads, text } = await timedRequest(key);
    expect(text).toBe(fixtureBodyText(anthropicText));
    // How many pieces a single read returns depends on when the client gets
    // scheduled, which the server does not control: a busy event loop finds
    // several pieces waiting in the receive buffer. The server's own record of
    // the run says what it put on the wire.
    expect(reads.length).toBeGreaterThan(100);
    const [entry] = (await (await flowmock.admin('/requests?limit=1')).json() as { items: Array<{ result: { writes: number; bytesWritten: number } }> }).items;
    const bodyBytes = new TextEncoder().encode(text).byteLength;
    expect(entry.result.bytesWritten).toBe(bodyBytes);
    expect(entry.result.writes).toBeGreaterThanOrEqual(Math.ceil(bodyBytes / 3));
  });

  it('paces the body to a bandwidth limit', async () => {
    const key = useScenario('fm-time-bandwidth', { name: 'slow-link', timing: { mode: 'synthetic', ttftMs: 0, tps: 100_000 }, network: { bandwidthKBps: 4 } });
    const started = performance.now();
    const { text } = await readTimed(await request(key));
    const bytes = new TextEncoder().encode(text).byteLength;
    expect(performance.now() - started).toBeGreaterThanOrEqual(((bytes - 500) / 4096) * 1000);
  });
});
