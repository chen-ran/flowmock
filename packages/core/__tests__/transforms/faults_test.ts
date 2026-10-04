import { describe, expect, it } from 'vitest';

import { adapterFor, applyInterrupt, applyStreamErrorEvent, applyTiming, createRng, decodeWireFrames, draftFromRecording, faultSchema, resolveCutPoint, timingSchema, type ReplayDraft } from '../../src/index.ts';
import { fixtureRecording } from '../support/fixtures.ts';
import { anthropicOverloadedMidStream, anthropicText, chatNonStream, responsesFailed, responsesText } from '@flowmock/test-fixtures';

const draftFor = async (fixture: typeof anthropicText, options: { stream?: boolean; wire?: 'sse' | 'ws' } = {}): Promise<ReplayDraft> => {
  const stream = options.stream ?? true;
  const wire = options.wire ?? (stream ? 'sse' : 'json');
  const draft = await draftFromRecording(fixtureRecording(fixture), { protocol: fixture.protocol, transport: wire === 'ws' ? 'ws' : 'http', wire, stream, fidelity: 'normal' }, adapterFor(fixture.protocol));
  applyTiming(draft, timingSchema.parse({ mode: 'recorded' }), createRng('t'));
  return draft;
};

const interrupt = (value: unknown) => faultSchema.parse({ type: 'interrupt', ...(value as object) }) as Extract<ReturnType<typeof faultSchema.parse>, { type: 'interrupt' }>;
const streamError = (value: unknown) => faultSchema.parse({ type: 'stream_error_event', ...(value as object) }) as Extract<ReturnType<typeof faultSchema.parse>, { type: 'stream_error_event' }>;

describe('resolveCutPoint', () => {
  it('counts output tokens for a fraction', async () => {
    const draft = await draftFor(anthropicText);
    // Five deltas of 5, 5, 6, 9 and 7 characters: 40% of the output is
    // reached inside the third delta, which is delivered whole.
    const cut = resolveCutPoint(draft, { fraction: 0.4 });
    expect(draft.frames[cut.index - 1].raw).toContain('" can I"');
    expect(cut.at).toBe(958);
  });

  it('cuts before the first output at fraction 0 and by time for afterMs', async () => {
    const draft = await draftFor(anthropicText);
    expect(draft.frames[resolveCutPoint(draft, { fraction: 0 }).index].content).toBe(true);
    expect(resolveCutPoint(draft, { afterMs: 940 })).toEqual({ index: 5, at: 940 });
  });
});

describe('applyInterrupt', () => {
  it('drops the frames after the cut and records the end action', async () => {
    const draft = await draftFor(anthropicText);
    applyInterrupt(draft, interrupt({ at: { fraction: 0.4 }, mode: 'reset' }));
    expect(draft.frames.at(-1)?.raw).toContain('" can I"');
    expect(draft.end).toEqual({ mode: 'reset' });
    expect(draft.endAt).toBe(958);
  });

  it('maps HTTP modes to WebSocket ones on a WebSocket turn', async () => {
    const draft = await draftFor(responsesText, { wire: 'ws' });
    applyInterrupt(draft, interrupt({ at: { frame: 3 }, mode: 'reset' }));
    expect(draft.end.mode).toBe('ws_terminate');
    const closing = await draftFor(responsesText, { wire: 'ws' });
    applyInterrupt(closing, interrupt({ at: { frame: 3 }, mode: 'ws_close', code: 1013, reason: 'try again' }));
    expect(closing.end).toEqual({ mode: 'ws_close', code: 1013, reason: 'try again' });
  });

  it('cuts a JSON body part way', async () => {
    const draft = await draftFor(chatNonStream, { stream: false });
    const full = draft.frames[0].raw.length;
    applyInterrupt(draft, interrupt({ at: { fraction: 0.5 }, mode: 'abort' }));
    expect(draft.frames[0].raw.length).toBe(Math.floor(full / 2));
    expect(draft.end.mode).toBe('abort');
  });
});

describe('applyStreamErrorEvent', () => {
  it('injects a recorded error event and ends the stream there', async () => {
    const sample = fixtureRecording(anthropicOverloadedMidStream);
    const adapter = adapterFor('anthropic-messages');
    const errorFrame = decodeWireFrames(sample.response.wire, sample.response.chunks).find(frame => adapter.frameInfo(frame).error)!;
    const draft = await draftFor(anthropicText);
    applyStreamErrorEvent(draft, streamError({ at: { fraction: 0.5 } }), [errorFrame.json], adapter, 'recording');
    const last = draft.frames.at(-1)!;
    expect(last.origin).toBe('injected');
    expect(last.raw).toBe('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n');
    expect(draft.frames.filter(frame => frame.sseEvent === 'message_stop')).toHaveLength(0);
  });

  it('rebinds a Responses response.failed to the replayed response', async () => {
    const sample = fixtureRecording(responsesFailed);
    const adapter = adapterFor('openai-responses');
    const failed = decodeWireFrames(sample.response.wire, sample.response.chunks).find(frame => adapter.frameInfo(frame).error)!;
    const draft = await draftFor(responsesText);
    applyStreamErrorEvent(draft, streamError({ at: { fraction: 0.5 } }), [failed.json], adapter, 'recording');
    const injected = draft.frames.at(-1)!.json as { type: string; sequence_number: number; response: { id: string; status: string; error: { code: string } } };
    const previous = draft.frames.at(-2)!.json as { sequence_number: number };
    expect(injected.type).toBe('response.failed');
    expect(injected.sequence_number).toBe(previous.sequence_number + 1);
    expect(injected.response).toMatchObject({ id: 'resp_68e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2', status: 'failed', error: { code: 'server_error' } });
  });
});
