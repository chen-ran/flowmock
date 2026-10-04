// The SSE encoder is ported from Floway
// packages/protocols/src/gemini-generate-content/to-sse.ts (MIT); the JSON
// array encoder is FlowMock's own. See NOTICE.md.

import type { GeminiGenerateContentStreamEvent } from './index.ts';
import { type ProtocolFrame, type SseFrame, sseFrame } from '../common/sse.ts';

// `alt=sse`: one unnamed `data:` block per response chunk and no `[DONE]`
// sentinel.
// https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
export const geminiGenerateContentProtocolFrameToSSEFrame = (frame: ProtocolFrame<GeminiGenerateContentStreamEvent>): SseFrame | null =>
  (frame.type === 'done' ? null : sseFrame(JSON.stringify(frame.event)));

// Without `alt=sse` the body is one JSON array streamed element by element.
// Google pretty-prints each element and separates them with `\n,\r\n`; the
// array closes with `\n]`.
export const geminiJsonArrayElementPrefix = (index: number): string => (index === 0 ? '[' : '\n,\r\n');

export const GEMINI_JSON_ARRAY_CLOSE = '\n]';

export const geminiGenerateContentEventToJsonArrayElement = (event: GeminiGenerateContentStreamEvent): string =>
  JSON.stringify(event, null, 2);
