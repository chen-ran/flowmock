import type { RecordedChunk } from './types.ts';
import { JsonArrayStreamDecoder, SseDecoder, type WireFormat } from '@flowmock/protocols/common';

export type WireFrameKind = 'sse' | 'sse-comment' | 'json-element' | 'ws-message' | 'json-body' | 'trailer';

// One unit of a recorded body: an SSE block, a JSON-array element, a
// WebSocket message, a whole JSON body, or leftover text (`\n]`, trailing
// blank lines) that belongs to no unit but is still part of the wire.
export interface WireFrame {
  kind: WireFrameKind;
  // Arrival time of the chunk that completed this frame, in milliseconds
  // since dispatch.
  t: number;
  // Exact wire text, separators included.
  raw: string;
  // Payload text: SSE data, element JSON, message text, or body text.
  data: string | null;
  sseEvent?: string;
  comment?: string;
  // Parsed payload; undefined when the payload is not JSON.
  json: unknown;
  // The `[DONE]` sentinel.
  done: boolean;
}

const parseJson = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
};

const payloadFrame = (kind: WireFrameKind, t: number, raw: string, data: string, sseEvent?: string): WireFrame => {
  const done = data.trim() === '[DONE]';
  return {
    kind,
    t,
    raw,
    data,
    ...(sseEvent === undefined ? {} : { sseEvent }),
    json: done ? undefined : parseJson(data),
    done,
  };
};

const trailerFrame = (t: number, raw: string): WireFrame => ({ kind: 'trailer', t, raw, data: null, json: undefined, done: false });

export const decodeWireFrames = (wire: WireFormat, chunks: readonly RecordedChunk[]): WireFrame[] => {
  const lastT = chunks.at(-1)?.t ?? 0;
  if (wire === 'ws') {
    const decoder = new TextDecoder();
    return chunks.map(chunk => {
      const text = decoder.decode(chunk.bytes);
      return payloadFrame('ws-message', chunk.t, text, text);
    });
  }

  const text = new TextDecoder();
  if (wire === 'json') {
    const body = chunks.map(chunk => text.decode(chunk.bytes, { stream: true })).join('') + text.decode();
    return body.length === 0 ? [] : [payloadFrame('json-body', lastT, body, body)];
  }

  const frames: WireFrame[] = [];
  if (wire === 'sse') {
    const sse = new SseDecoder();
    const push = (t: number, blocks: ReturnType<SseDecoder['feed']>) => {
      for (const block of blocks) {
        frames.push(block.type === 'sse'
          ? payloadFrame('sse', t, block.raw, block.data, block.event)
          : { kind: 'sse-comment', t, raw: block.raw, data: null, comment: block.comment, json: undefined, done: false });
      }
    };
    for (const chunk of chunks) push(chunk.t, sse.feed(text.decode(chunk.bytes, { stream: true })));
    push(lastT, sse.feed(text.decode()));
    const flushed = sse.flush();
    push(lastT, flushed.blocks);
    if (flushed.trailing) frames.push(trailerFrame(lastT, flushed.trailing));
    return frames;
  }

  const array = new JsonArrayStreamDecoder();
  try {
    for (const chunk of chunks) {
      for (const element of array.feed(text.decode(chunk.bytes, { stream: true }))) frames.push(payloadFrame('json-element', chunk.t, element.raw, element.data));
    }
    for (const element of array.feed(text.decode())) frames.push(payloadFrame('json-element', lastT, element.raw, element.data));
  } catch {
    // A body that is not an array at all (an error object, an HTML page)
    // stays replayable as one opaque trailer.
    const body = new TextDecoder().decode(concatChunks(chunks));
    return body.length === 0 ? [] : [trailerFrame(lastT, body)];
  }
  const flushed = array.flush();
  if (flushed.trailing) frames.push(trailerFrame(lastT, flushed.trailing));
  return frames;
};

export const concatChunks = (chunks: readonly RecordedChunk[]): Uint8Array => {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.bytes.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.bytes, offset);
    offset += chunk.bytes.byteLength;
  }
  return bytes;
};

export const bodyText = (chunks: readonly RecordedChunk[]): string => new TextDecoder().decode(concatChunks(chunks));

// The wire format of a response as recorded. Gemini's two stream encodings
// share a content type with plain JSON, so the request decides between them.
export const detectResponseWire = (input: { status: number; contentType: string | null; stream: boolean; streamWire: WireFormat }): WireFormat => {
  if (input.status >= 400) return 'json';
  if (input.contentType?.toLowerCase().includes('text/event-stream')) return 'sse';
  if (input.stream && input.streamWire === 'json-array') return 'json-array';
  return 'json';
};
