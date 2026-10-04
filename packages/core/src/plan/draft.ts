import type { DraftFrame, ReplayDraft } from './types.ts';
import { allocateTokens, analyzeResponse, estimateTokens } from '../corpus/analyze.ts';
import type { HeaderList, Recording } from '../corpus/types.ts';
import { bodyText, type WireFrame } from '../corpus/wire.ts';
import type { ProtocolAdapter } from '../protocols/adapter.ts';
import { encodeSseFrame, type Protocol, type WireFormat } from '@flowmock/protocols/common';
import { GEMINI_JSON_ARRAY_CLOSE, geminiJsonArrayElementPrefix } from '@flowmock/protocols/gemini-generate-content';

export interface DraftTarget {
  protocol: Protocol;
  transport: 'http' | 'ws';
  // Encoding the client expects for a successful body.
  wire: WireFormat;
  stream: boolean;
  fidelity: 'normal' | 'raw';
}

// Headers that describe the original connection or body encoding rather than
// the response, plus cookies an upstream set for its own clients.
const DROPPED_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'date',
  'set-cookie', 'alt-svc', 'proxy-connection', 'upgrade', 'te', 'trailer',
]);

const CONTENT_TYPES: Record<WireFormat, string> = {
  sse: 'text/event-stream; charset=utf-8',
  'json-array': 'application/json; charset=UTF-8',
  json: 'application/json',
  ws: 'application/json',
};

export const replayHeaders = (headers: HeaderList, wire: WireFormat, contentTypeChanged: boolean): HeaderList => {
  const kept = headers.filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase()));
  if (!contentTypeChanged) return kept;
  return [...kept.filter(([name]) => name.toLowerCase() !== 'content-type'), ['content-type', CONTENT_TYPES[wire]]];
};

// Re-encodes a payload for `wire`. `elementIndex` positions a JSON-array
// element so the first one opens the array.
export const encodeFrameText = (wire: WireFormat, data: string, sseEvent: string | undefined, elementIndex: number): string => {
  switch (wire) {
  case 'sse': return encodeSseFrame({ type: 'sse', event: sseEvent, data });
  case 'json-array': return geminiJsonArrayElementPrefix(elementIndex) + data;
  case 'ws':
  case 'json': return data;
  }
};

// Replaces a frame's payload, keeping the wire spelling around it where the
// encoding allows (a JSON-array element keeps its separator).
export const setFrameData = (frame: DraftFrame, data: string, wire: WireFormat, elementIndex: number): void => {
  if (wire === 'json-array' && frame.data !== null && frame.raw.endsWith(frame.data)) {
    frame.raw = frame.raw.slice(0, frame.raw.length - frame.data.length) + data;
  } else {
    frame.raw = encodeFrameText(wire, data, frame.sseEvent, elementIndex);
  }
  frame.data = data;
  try {
    frame.json = JSON.parse(data) as unknown;
  } catch {
    frame.json = undefined;
  }
};

const bodyFrame = (raw: string, at: number, origin: DraftFrame['origin']): DraftFrame => {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    json = undefined;
  }
  return { kind: 'json-body', raw, data: raw, json, done: false, recordedAt: at, at, content: false, contentChars: 0, tokens: 0, origin };
};

// The spec's WebSocket error envelope wraps an HTTP-style error object.
// https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/src/specifications/2026-04-24.mdx#L99-L127
export const websocketErrorMessage = (status: number, body: unknown): string => {
  const nested = typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'object'
    ? (body as { error: Record<string, unknown> }).error
    : typeof body === 'object' && body !== null ? body as Record<string, unknown> : { message: String(body) };
  const type = typeof nested.type === 'string' ? nested.type : status >= 500 ? 'server_error' : 'invalid_request_error';
  return JSON.stringify({ type: 'error', status, error: { ...nested, type, code: typeof nested.code === 'string' ? nested.code : type } });
};

const streamFrames = (frames: readonly WireFrame[], recordedWire: WireFormat, target: DraftTarget, adapter: ProtocolAdapter, analysisInfos: ReturnType<ProtocolAdapter['frameInfo']>[]): DraftFrame[] => {
  const sameWire = recordedWire === target.wire;
  const drafted: DraftFrame[] = [];
  let elementIndex = 0;
  for (const [index, frame] of frames.entries()) {
    const info = analysisInfos[index];
    const base = { recordedAt: frame.t, at: frame.t, content: info.content, contentChars: info.contentChars, tokens: 0 };
    if (sameWire) {
      drafted.push({ ...base, kind: frame.kind, raw: frame.raw, data: frame.data, json: frame.json, ...(frame.sseEvent === undefined ? {} : { sseEvent: frame.sseEvent }), done: frame.done, origin: 'recorded' });
      continue;
    }
    // Comments, sentinels and leftover text have no counterpart in another
    // encoding.
    if (frame.data === null || frame.kind === 'trailer') continue;
    if (frame.done && target.wire !== 'sse') continue;
    const sseEvent = frame.sseEvent ?? adapter.sseEventName(frame.json);
    const raw = encodeFrameText(target.wire, frame.data, sseEvent, elementIndex);
    if (target.wire === 'json-array') elementIndex++;
    drafted.push({
      ...base,
      kind: target.wire === 'sse' ? 'sse' : target.wire === 'ws' ? 'ws-message' : 'json-element',
      raw,
      data: frame.data,
      json: frame.json,
      ...(sseEvent === undefined ? {} : { sseEvent }),
      done: frame.done,
      origin: 'reencoded',
    });
  }
  if (!sameWire && target.wire === 'json-array') {
    const lastAt = frames.at(-1)?.t ?? 0;
    drafted.push({ kind: 'trailer', raw: elementIndex === 0 ? `[${GEMINI_JSON_ARRAY_CLOSE}` : GEMINI_JSON_ARRAY_CLOSE, data: null, json: undefined, done: false, recordedAt: lastAt, at: lastAt, content: false, contentChars: 0, tokens: 0, origin: 'reencoded' });
  }
  return drafted;
};

export const draftFromRecording = async (recording: Recording, target: DraftTarget, adapter: ProtocolAdapter): Promise<ReplayDraft> => {
  const { response } = recording;
  const analysis = analyzeResponse(adapter, response);
  const contentChars = analysis.infos.reduce((sum, info) => sum + info.contentChars, 0);
  const outputTokens = analysis.summary.outputTokens ?? estimateTokens(contentChars);
  const draft: ReplayDraft = {
    protocol: target.protocol,
    transport: target.transport,
    wire: target.wire,
    status: response.status,
    headers: [],
    headersAt: response.headersAt,
    frames: [],
    end: { mode: 'complete' },
    endAt: null,
    outputTokens,
    source: { recordingId: recording.id, recordingModel: recording.model, responseModel: analysis.summary.responseModel },
    fidelity: target.fidelity,
    rawChunks: null,
    idMap: new Map(),
    provenance: [],
  };

  if (response.status >= 400) {
    const text = bodyText(response.chunks);
    if (target.transport === 'ws') {
      draft.wire = 'ws';
      draft.frames = [{ ...bodyFrame(websocketErrorMessage(response.status, safeJson(text)), response.endedAt, 'reencoded'), kind: 'ws-message' }];
    } else {
      draft.wire = 'json';
      draft.headers = replayHeaders(response.headers, 'json', false);
      draft.frames = [bodyFrame(text, response.endedAt, 'recorded')];
    }
    draft.outputTokens = 0;
    return draft;
  }

  if (!target.stream) {
    draft.wire = 'json';
    if (response.wire === 'json') {
      draft.headers = replayHeaders(response.headers, 'json', false);
      draft.frames = [bodyFrame(bodyText(response.chunks), response.endedAt, 'recorded')];
    } else {
      const events = analysis.frames.filter(frame => frame.json !== undefined).map(frame => frame.json);
      const collected = await adapter.collect(events);
      draft.headers = replayHeaders(response.headers, 'json', true);
      draft.frames = [bodyFrame(adapter.encodeBody(collected), response.endedAt, 'collected')];
      draft.provenance.push({ transform: 'collect', detail: `reduced ${events.length} recorded stream events into one JSON body` });
    }
    // A non-streaming API answers with headers and body together.
    draft.headersAt = response.endedAt;
    return draft;
  }

  if (response.wire === 'json') throw new Error(`Recording ${recording.id} is not streamed and cannot answer a streaming request`);
  draft.frames = streamFrames(analysis.frames, response.wire, target, adapter, analysis.infos);
  const tokens = allocateTokens(draft.frames.map(frame => frame.contentChars), outputTokens);
  draft.frames.forEach((frame, index) => { frame.tokens = tokens[index]; });
  draft.headers = replayHeaders(response.headers, target.wire, response.wire !== target.wire);
  if (response.wire !== target.wire) {
    draft.provenance.push({ transform: 'reencode', detail: `re-encoded ${response.wire} frames as ${target.wire}` });
  }

  if (target.fidelity === 'raw') {
    if (response.wire === target.wire && target.transport === recording.transport) {
      draft.rawChunks = response.chunks.map(chunk => ({ ...chunk, at: chunk.t }));
    } else {
      draft.fidelity = 'normal';
      draft.provenance.push({ transform: 'fidelity', detail: `raw fidelity needs the recorded encoding (${response.wire}); replaying frames instead` });
    }
  }
  return draft;
};

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

// A response FlowMock composes itself: an error envelope or an injected
// HTTP error. `delayMs` is when the whole response goes out.
export const draftFromBody = (input: {
  protocol: Protocol;
  transport: 'http' | 'ws';
  status: number;
  headers: HeaderList;
  body: string;
  delayMs: number;
  recordingId: string | null;
  origin: DraftFrame['origin'];
}): ReplayDraft => {
  const frame = input.transport === 'ws'
    ? { ...bodyFrame(websocketErrorMessage(input.status, safeJson(input.body)), input.delayMs, input.origin), kind: 'ws-message' as const }
    : bodyFrame(input.body, input.delayMs, input.origin);
  return {
    protocol: input.protocol,
    transport: input.transport,
    wire: input.transport === 'ws' ? 'ws' : 'json',
    status: input.status,
    headers: replayHeaders(input.headers, 'json', false),
    headersAt: input.delayMs,
    frames: [frame],
    end: { mode: 'complete' },
    endAt: null,
    outputTokens: 0,
    source: { recordingId: input.recordingId, recordingModel: null, responseModel: null },
    fidelity: 'normal',
    rawChunks: null,
    idMap: new Map(),
    provenance: [],
  };
};
