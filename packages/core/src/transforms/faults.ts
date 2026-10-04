import { encodeFrameText, setFrameData } from '../plan/draft.ts';
import type { DraftFrame, EndAction, ReplayDraft } from '../plan/types.ts';
import type { ProtocolAdapter } from '../protocols/adapter.ts';
import { isObject } from '../protocols/adapter.ts';
import type { Fault, Position } from '../scenario/schema.ts';

export interface CutPoint {
  // Frames [0, index) are delivered before the fault.
  index: number;
  // When the fault happens, in milliseconds since the request arrived.
  at: number;
}

// Resolves a fault position against the scheduled draft. A fraction counts
// output tokens: 0.4 delivers the frames that carry the first 40% of the
// output and nothing after them.
export const resolveCutPoint = (draft: ReplayDraft, position: Position): CutPoint => {
  const frames = draft.frames;
  const timeBefore = (index: number) => (index > 0 ? frames[index - 1].at : draft.headersAt);
  if (position.afterMs !== undefined) {
    const index = frames.filter(frame => frame.at <= position.afterMs!).length;
    return { index, at: Math.max(position.afterMs, timeBefore(index)) };
  }
  if (position.frame !== undefined) {
    const index = Math.min(position.frame, frames.length);
    return { index, at: timeBefore(index) };
  }
  const fraction = position.fraction ?? 0.5;
  const total = frames.reduce((sum, frame) => sum + frame.tokens, 0);
  const content = frames.flatMap((frame, index) => (frame.content ? [index] : []));
  if (total === 0 || content.length === 0) {
    const index = Math.round(fraction * frames.length);
    return { index, at: timeBefore(index) };
  }
  if (fraction === 0) return { index: content[0], at: timeBefore(content[0]) };
  let cumulative = 0;
  for (const index of content) {
    cumulative += frames[index].tokens;
    if (cumulative >= fraction * total - 1e-9) return { index: index + 1, at: frames[index].at };
  }
  const index = content.at(-1)! + 1;
  return { index, at: timeBefore(index) };
};

const cutJsonBody = (draft: ReplayDraft, fraction: number): void => {
  const frame = draft.frames[0];
  const keep = Math.floor(frame.raw.length * fraction);
  frame.raw = frame.raw.slice(0, keep);
  frame.data = frame.raw;
  frame.json = undefined;
  frame.origin = 'injected';
};

export const applyInterrupt = (draft: ReplayDraft, fault: Extract<Fault, { type: 'interrupt' }>): void => {
  let mode = fault.mode;
  if (draft.transport === 'ws' && (mode === 'fin' || mode === 'abort' || mode === 'reset')) mode = 'ws_terminate';
  if (draft.transport === 'http' && (mode === 'ws_close' || mode === 'ws_terminate')) mode = 'reset';
  const end: EndAction = mode === 'ws_close'
    ? { mode, code: fault.code, reason: fault.reason }
    : mode === 'hang' ? { mode, hangMs: fault.hangMs } : { mode };

  if (draft.wire === 'json' && draft.frames.length === 1) {
    const fraction = fault.at.fraction ?? 0.5;
    const at = fault.at.afterMs ?? draft.frames[0].at;
    draft.frames[0].at = Math.min(draft.frames[0].at, at);
    cutJsonBody(draft, fraction);
    draft.end = end;
    draft.endAt = at;
    draft.provenance.push({ transform: 'interrupt', detail: `${mode} after ${draft.frames[0].raw.length} body characters at ${at}ms` });
    return;
  }

  const cut = resolveCutPoint(draft, fault.at);
  const dropped = draft.frames.length - cut.index;
  draft.frames = draft.frames.slice(0, cut.index);
  if (draft.rawChunks) truncateRawChunks(draft);
  draft.end = end;
  draft.endAt = cut.at;
  draft.provenance.push({ transform: 'interrupt', detail: `${mode} at ${cut.at}ms after ${cut.index} frames (${dropped} dropped)` });
};

// Raw fidelity cuts the recorded chunks at the byte where the kept frames end.
const truncateRawChunks = (draft: ReplayDraft): void => {
  const encoder = new TextEncoder();
  let budget = draft.frames.reduce((sum, frame) => sum + encoder.encode(frame.raw).byteLength, 0);
  const kept: NonNullable<ReplayDraft['rawChunks']> = [];
  for (const chunk of draft.rawChunks ?? []) {
    if (budget <= 0) break;
    if (chunk.bytes.byteLength <= budget) {
      kept.push(chunk);
      budget -= chunk.bytes.byteLength;
    } else {
      kept.push({ ...chunk, bytes: chunk.bytes.subarray(0, budget) });
      budget = 0;
    }
  }
  draft.rawChunks = kept;
};

const lastSequenceNumber = (frames: readonly DraftFrame[]): number | null => {
  let last: number | null = null;
  for (const frame of frames) {
    if (isObject(frame.json) && typeof frame.json.sequence_number === 'number') last = frame.json.sequence_number;
  }
  return last;
};

// Adapts an error event taken from another recording to the response being
// replayed. A Responses `response.failed` carries a whole response object,
// so it is rebuilt from this response's own `response.created` envelope.
const bindErrorEvent = (event: unknown, delivered: readonly DraftFrame[], adapter: ProtocolAdapter): unknown => {
  if (adapter.protocol !== 'openai-responses' || !isObject(event)) return event;
  const sequence = lastSequenceNumber(delivered);
  const bound: Record<string, unknown> = { ...event, ...(sequence === null ? {} : { sequence_number: sequence + 1 }) };
  if (event.type === 'response.failed' && isObject(event.response)) {
    const envelope = delivered.map(frame => frame.json).find(json => isObject(json) && isObject(json.response));
    if (isObject(envelope) && isObject(envelope.response)) {
      bound.response = { ...envelope.response, status: 'failed', error: event.response.error ?? null, output: [], usage: null };
    }
  }
  return bound;
};

export const applyStreamErrorEvent = (
  draft: ReplayDraft,
  fault: Extract<Fault, { type: 'stream_error_event' }>,
  errorEvents: readonly unknown[],
  adapter: ProtocolAdapter,
  sourceLabel: string,
): void => {
  if (draft.wire === 'json') {
    draft.provenance.push({ transform: 'stream_error_event', detail: 'skipped: the request does not stream' });
    return;
  }
  const cut = resolveCutPoint(draft, fault.at);
  const delivered = draft.frames.slice(0, cut.index);
  let elementIndex = delivered.filter(frame => frame.kind === 'json-element').length;
  const injected = errorEvents.map(event => {
    const bound = bindErrorEvent(event, delivered, adapter);
    const data = JSON.stringify(bound);
    const sseEvent = adapter.sseEventName(bound);
    const frame: DraftFrame = {
      kind: draft.wire === 'sse' ? 'sse' : draft.wire === 'ws' ? 'ws-message' : 'json-element',
      raw: encodeFrameText(draft.wire, data, sseEvent, elementIndex),
      data,
      json: bound,
      ...(sseEvent === undefined ? {} : { sseEvent }),
      done: false,
      recordedAt: cut.at,
      at: cut.at,
      content: false,
      contentChars: 0,
      tokens: 0,
      origin: 'injected',
    };
    // Identifiers the sample shares with the replayed response follow the
    // same rewrite.
    if (draft.idMap.size > 0) {
      const rewritten = data.replace(new RegExp([...draft.idMap.keys()].map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'), id => draft.idMap.get(id) ?? id);
      if (rewritten !== data) setFrameData(frame, rewritten, draft.wire, elementIndex);
    }
    if (draft.wire === 'json-array') elementIndex++;
    return frame;
  });
  const tail: DraftFrame[] = [];
  if (draft.wire === 'json-array') {
    tail.push({ kind: 'trailer', raw: '\n]', data: null, json: undefined, done: false, recordedAt: cut.at, at: cut.at, content: false, contentChars: 0, tokens: 0, origin: 'injected' });
  }
  draft.frames = [...delivered, ...injected, ...tail];
  draft.rawChunks = null;
  draft.end = { mode: 'complete' };
  draft.endAt = cut.at;
  draft.provenance.push({ transform: 'stream_error_event', detail: `${injected.length} ${sourceLabel} error event(s) at ${cut.at}ms after ${cut.index} frames` });
};
