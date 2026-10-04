import { describe, expect, it } from 'vitest';

import { adapterFor, applyTiming, createRng, draftFromRecording, encodePlan, timingSchema, type ReplayDraft } from '../../src/index.ts';
import { fixtureRecording } from '../support/fixtures.ts';
import { anthropicNonStream, anthropicText, responsesFunctionCall } from '@flowmock/test-fixtures';

const draftFor = async (fixture: typeof anthropicText, stream = true): Promise<ReplayDraft> =>
  await draftFromRecording(fixtureRecording(fixture), { protocol: fixture.protocol, transport: 'http', wire: stream ? 'sse' : 'json', stream, fidelity: 'normal' }, adapterFor(fixture.protocol));

describe('applyTiming', () => {
  it('scales recorded intervals', async () => {
    const draft = await draftFor(anthropicText);
    applyTiming(draft, timingSchema.parse({ mode: 'recorded', scale: 2 }), createRng('t'));
    expect(draft.headersAt).toBe(810);
    expect(draft.frames.find(frame => frame.content)?.at).toBe(1810);
  });

  it.each([
    [{ ttftMs: 800, tps: 50 }],
    [{ ttftMs: 120, tps: 400 }],
    [{ ttftMs: 3000, tps: 7 }],
  ])('reproduces a fixed TTFT and TPS exactly (%o)', async ({ ttftMs, tps }) => {
    for (const fixture of [anthropicText, responsesFunctionCall]) {
      const draft = await draftFor(fixture);
      applyTiming(draft, timingSchema.parse({ mode: 'synthetic', ttftMs, tps }), createRng('t'));
      const plan = encodePlan(draft);
      expect(plan.expected.ttftMs).toBeCloseTo(ttftMs, 2);
      expect(plan.expected.tps).toBeCloseTo(tps, 1);
    }
  });

  it('keeps the recorded shape of frames before the first output', async () => {
    const draft = await draftFor(anthropicText);
    applyTiming(draft, timingSchema.parse({ mode: 'synthetic', ttftMs: 1810, tps: 100 }), createRng('t'));
    // message_start arrived at 412ms of a 905ms TTFT; it keeps that share.
    expect(draft.frames[0].at).toBeCloseTo(824, 3);
    expect(draft.headersAt).toBeCloseTo(810, 3);
  });

  it('keeps frame times monotonic under jitter', async () => {
    const draft = await draftFor(responsesFunctionCall);
    applyTiming(draft, timingSchema.parse({ mode: 'synthetic', ttftMs: 500, tps: 80, jitterMs: 200 }), createRng('jitter'));
    const times = draft.frames.map(frame => frame.at);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  it('delivers a non-streaming body after TTFT plus generation time', async () => {
    const draft = await draftFor(anthropicNonStream, false);
    applyTiming(draft, timingSchema.parse({ mode: 'synthetic', ttftMs: 400, tps: 9 }), createRng('t'));
    expect(draft.frames[0].at).toBeCloseTo(1400, 6);
    expect(draft.headersAt).toBe(draft.frames[0].at);
  });

  it('samples distributions reproducibly from the seed', async () => {
    const sample = async (seed: string) => {
      const draft = await draftFor(anthropicText);
      applyTiming(draft, timingSchema.parse({ mode: 'synthetic', ttftMs: { dist: 'lognormal', p50: 800, p95: 3000 }, tps: { dist: 'normal', mean: 60, sd: 10 } }), createRng(seed));
      return encodePlan(draft).expected;
    };
    expect(await sample('a')).toEqual(await sample('a'));
    expect(await sample('a')).not.toEqual(await sample('b'));
  });
});
