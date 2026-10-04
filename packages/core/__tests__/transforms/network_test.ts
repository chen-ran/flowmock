import { describe, expect, it } from 'vitest';

import { adapterFor, applyNetwork, applyTiming, createRng, draftFromRecording, encodePlan, networkSchema, timingSchema, type ReplayPlan } from '../../src/index.ts';
import { fixtureRecording } from '../support/fixtures.ts';
import { anthropicText } from '@flowmock/test-fixtures';

const planFor = async (text = anthropicText): Promise<ReplayPlan> => {
  const draft = await draftFromRecording(fixtureRecording(text), { protocol: text.protocol, transport: 'http', wire: 'sse', stream: true, fidelity: 'normal' }, adapterFor(text.protocol));
  applyTiming(draft, timingSchema.parse({ mode: 'recorded' }), createRng('t'));
  return encodePlan(draft);
};

const concat = (plan: ReplayPlan): Uint8Array => {
  const parts = plan.writes.map(write => write.bytes!);
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
};

describe('applyNetwork', () => {
  it('fragments writes at arbitrary byte boundaries without changing the bytes', async () => {
    const plain = await planFor();
    const shaped = await planFor();
    applyNetwork(shaped, networkSchema.parse({ fragmentation: { maxBytes: 7 } }), createRng('n'));
    expect(concat(shaped)).toEqual(concat(plain));
    expect(shaped.writes.every(write => write.bytes!.byteLength >= 1 && write.bytes!.byteLength <= 7)).toBe(true);
    expect(shaped.writes.length).toBeGreaterThan(plain.writes.length * 5);
    // Tokens stay on the last piece of each frame so TPS accounting holds.
    expect(shaped.writes.reduce((sum, write) => sum + write.tokens, 0)).toBeCloseTo(plain.outputTokens, 6);
  });

  it('splits inside multi-byte UTF-8 characters', async () => {
    const multibyte = {
      ...anthropicText,
      response: {
        ...anthropicText.response,
        chunks: anthropicText.response.chunks.map(chunk => ({ ...chunk, text: chunk.text.replace('Hello', '你好世界!') })),
      },
    };
    const plan = await planFor(multibyte);
    applyNetwork(plan, networkSchema.parse({ fragmentation: { maxBytes: 2 } }), createRng('utf8'));
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const splitInside = plan.writes.some(write => {
      try {
        decoder.decode(write.bytes);
        return false;
      } catch {
        return true;
      }
    });
    expect(splitInside).toBe(true);
    expect(new TextDecoder().decode(concat(plan))).toContain('你好世界!');
  });

  it('paces writes to the bandwidth limit', async () => {
    const plan = await planFor();
    const total = concat(plan).byteLength;
    applyNetwork(plan, networkSchema.parse({ bandwidthKBps: 1 }), createRng('n'));
    const last = plan.writes.at(-1)!;
    // 1 KB/s moves 1.024 bytes per millisecond, so the body cannot finish
    // before total / 1.024 ms after its first byte.
    expect(last.at - plan.writes[0].at).toBeGreaterThanOrEqual(((total - last.bytes!.byteLength) / 1.024) - 1);
  });

  it('adds latency to headers and writes, and stalls push later writes back', async () => {
    const plain = await planFor();
    const plan = await planFor();
    applyNetwork(plan, networkSchema.parse({ latencyMs: 80, headersDelayMs: 20, stalls: { probability: 1, durationMs: [100, 100] } }), createRng('n'));
    expect(plan.headersAt).toBe(plain.headersAt + 100);
    expect(plan.writes[0].at).toBe(Math.max(plain.writes[0].at + 180, plan.headersAt));
    expect(plan.writes.at(-1)!.at).toBe(plain.writes.at(-1)!.at + 80 + 100 * plain.writes.length);
  });

  it('stalls per frame, however finely the frames are fragmented', async () => {
    const plain = await planFor();
    const plan = await planFor();
    const notes = applyNetwork(plan, networkSchema.parse({ fragmentation: { maxBytes: 2, gapMs: 0 }, stalls: { probability: 1, durationMs: [10, 10] } }), createRng('n'));
    expect(notes).toContain(`${plain.writes.length} stall(s)`);
    expect(plan.writes.at(-1)!.at).toBeLessThanOrEqual(plain.writes.at(-1)!.at + 10 * plain.writes.length + 1);
  });

  it('is reproducible for a seed', async () => {
    const shape = async (seed: string) => {
      const plan = await planFor();
      applyNetwork(plan, networkSchema.parse({ jitterMs: 30, fragmentation: { maxBytes: 9 }, stalls: { probability: 0.3, durationMs: [10, 50] } }), createRng(seed));
      return plan.writes.map(write => [write.at, write.bytes!.byteLength]);
    };
    expect(await shape('x')).toEqual(await shape('x'));
    expect(await shape('x')).not.toEqual(await shape('y'));
  });
});
