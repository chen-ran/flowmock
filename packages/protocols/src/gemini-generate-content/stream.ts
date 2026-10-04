import type { GeminiGenerateContentStreamEvent } from './index.ts';
import { JsonArrayStreamDecoder } from '../common/json-array-decoder.ts';
import { parseTargetStreamFrames } from '../common/parse-events.ts';
import { parseSSEStream } from '../common/parse-sse.ts';
import { doneFrame, eventFrame, type ProtocolFrame } from '../common/sse.ts';

export interface ParseGeminiGenerateContentStreamOptions {
  signal?: AbortSignal;
}

// `streamGenerateContent?alt=sse`. Gemini sends no `[DONE]`; the stream ends
// with the body, so the parser yields a done frame at EOF to give consumers
// the same end marker the other protocols carry.
export const parseGeminiGenerateContentSseStream = (
  body: ReadableStream<Uint8Array>,
  options: ParseGeminiGenerateContentStreamOptions = {},
): AsyncGenerator<ProtocolFrame<GeminiGenerateContentStreamEvent>> => (async function* () {
  for await (const frame of parseTargetStreamFrames<GeminiGenerateContentStreamEvent>(parseSSEStream(body, options), {
    protocol: 'Gemini generateContent',
  })) {
    if (frame.type === 'done') break;
    yield eventFrame(frame.data);
  }
  yield doneFrame();
})();

// `streamGenerateContent` without `alt=sse`: a JSON array whose elements
// arrive one at a time.
export const parseGeminiGenerateContentJsonArrayStream = (
  body: ReadableStream<Uint8Array>,
  options: ParseGeminiGenerateContentStreamOptions = {},
): AsyncGenerator<ProtocolFrame<GeminiGenerateContentStreamEvent>> => (async function* () {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const elements = new JsonArrayStreamDecoder();
  const { signal } = options;
  const parse = (data: string): GeminiGenerateContentStreamEvent => {
    try {
      return JSON.parse(data) as GeminiGenerateContentStreamEvent;
    } catch (error) {
      throw new Error(`Malformed upstream Gemini generateContent JSON array element: ${data}`, { cause: error });
    }
  };
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      for (const element of elements.feed(decoder.decode(value, { stream: true }))) yield eventFrame(parse(element.data));
    }
    for (const element of elements.feed(decoder.decode())) yield eventFrame(parse(element.data));
    const { closed, trailing } = elements.flush();
    if (!closed) throw new Error(`Gemini generateContent JSON array stream ended before its closing bracket: ${JSON.stringify(trailing)}`);
    yield doneFrame();
  } finally {
    await reader.cancel().catch(() => {});
  }
})();
