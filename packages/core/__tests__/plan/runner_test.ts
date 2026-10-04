import { describe, expect, it } from 'vitest';

import { adapterFor, applyInterrupt, applyNetwork, applyTiming, createRng, draftFromRecording, encodePlan, faultSchema, networkSchema, runHttpPlan, runMessagePlan, timingSchema, type ReplayPlan } from '../../src/index.ts';
import { InstantClock, RecordingHttpTransport, RecordingMessageTransport } from '../support/fakes.ts';
import { fixtureRecording } from '../support/fixtures.ts';
import { anthropicText, responsesText } from '@flowmock/test-fixtures';

const plan = async (options: { timing?: unknown; network?: unknown; interrupt?: unknown; wire?: 'sse' | 'ws'; fixture?: typeof anthropicText } = {}): Promise<ReplayPlan> => {
  const fixture = options.fixture ?? anthropicText;
  const wire = options.wire ?? 'sse';
  const draft = await draftFromRecording(fixtureRecording(fixture), { protocol: fixture.protocol, transport: wire === 'ws' ? 'ws' : 'http', wire, stream: true, fidelity: 'normal' }, adapterFor(fixture.protocol));
  applyTiming(draft, timingSchema.parse(options.timing ?? { mode: 'recorded' }), createRng('t'));
  if (options.interrupt) applyInterrupt(draft, faultSchema.parse({ type: 'interrupt', ...(options.interrupt as object) }) as never);
  const encoded = encodePlan(draft);
  if (options.network) applyNetwork(encoded, networkSchema.parse(options.network), createRng('n'));
  return encoded;
};

describe('runHttpPlan', () => {
  it('writes every frame at its scheduled time and completes the response', async () => {
    const clock = new InstantClock();
    clock.advance(1000);
    const transport = new RecordingHttpTransport(clock);
    const replay = await plan();
    const result = await runHttpPlan(replay, transport, clock, 1000);
    expect(result.outcome).toBe('completed');
    expect(transport.events[0]).toMatchObject({ type: 'head', status: 200, at: 1000 + 405 });
    expect(transport.events.filter(event => event.type === 'write').map(event => event.at - 1000)).toEqual(replay.writes.map(write => write.at));
    expect(transport.events.at(-1)?.type).toBe('end');
    expect(transport.body()).toBe(anthropicText.response.chunks.map(chunk => chunk.text).join(''));
  });

  it('achieves the planned TTFT and TPS on the wire, fragmented or not', async () => {
    for (const network of [undefined, { fragmentation: { maxBytes: 5, gapMs: 0 } }]) {
      const clock = new InstantClock();
      const replay = await plan({ timing: { mode: 'synthetic', ttftMs: 640, tps: 42 }, network });
      const result = await runHttpPlan(replay, new RecordingHttpTransport(clock), clock, 0);
      expect(result.achievedTtftMs).toBeCloseTo(640, 6);
      // Scheduled times are rounded to the microsecond.
      expect(result.achievedTps).toBeCloseTo(42, 3);
    }
  });

  it.each([
    ['reset', 'reset'],
    ['abort', 'abort'],
    ['fin', 'end'],
  ] as const)('ends an interrupted response with %s', async (mode, event) => {
    const clock = new InstantClock();
    const transport = new RecordingHttpTransport(clock);
    const result = await runHttpPlan(await plan({ interrupt: { at: { fraction: 0.5 }, mode } }), transport, clock, 0);
    expect(result).toMatchObject({ outcome: 'interrupted', endMode: mode });
    expect(transport.events.at(-1)?.type).toBe(event);
    expect(transport.body()).not.toContain('message_stop');
  });

  it('holds a hung connection for hangMs before dropping it', async () => {
    const clock = new InstantClock();
    const transport = new RecordingHttpTransport(clock);
    const result = await runHttpPlan(await plan({ interrupt: { at: { afterMs: 950 }, mode: 'hang', hangMs: 5000 } }), transport, clock, 0);
    expect(result.endMode).toBe('hang');
    expect(transport.events.at(-1)).toMatchObject({ type: 'abort', at: 5950 });
  });

  it('stops writing when the client goes away', async () => {
    const clock = new InstantClock();
    const transport = new RecordingHttpTransport(clock, { abortAfterWrites: 3 });
    const result = await runHttpPlan(await plan(), transport, clock, 0);
    expect(result.outcome).toBe('client_aborted');
    expect(transport.events.filter(event => event.type === 'write')).toHaveLength(3);
  });
});

describe('runMessagePlan', () => {
  it('sends one message per event and leaves the socket open after a completed turn', async () => {
    const clock = new InstantClock();
    const transport = new RecordingMessageTransport(clock);
    const result = await runMessagePlan(await plan({ wire: 'ws', fixture: responsesText }), transport, clock, 0);
    expect(result.outcome).toBe('completed');
    const types = transport.events.map(event => (JSON.parse(event.text!) as { type: string }).type);
    expect(types[0]).toBe('response.created');
    expect(types.at(-1)).toBe('response.completed');
    expect(transport.events.every(event => event.type === 'send')).toBe(true);
  });

  it('closes with the configured code', async () => {
    const clock = new InstantClock();
    const transport = new RecordingMessageTransport(clock);
    await runMessagePlan(await plan({ wire: 'ws', fixture: responsesText, interrupt: { at: { frame: 4 }, mode: 'ws_close', code: 1013 } }), transport, clock, 0);
    expect(transport.events.at(-1)).toMatchObject({ type: 'close', code: 1013 });
    expect(transport.events.filter(event => event.type === 'send')).toHaveLength(4);
  });
});
