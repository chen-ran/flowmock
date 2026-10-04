// Ported from Floway packages/protocols/src/openai-responses/to-sse.ts (MIT). See NOTICE.md.

import type { OpenAIResponsesStreamEvent } from './index.ts';
import { type ProtocolFrame, type SseFrame, sseFrame } from '../common/index.ts';

export const openaiResponsesProtocolFrameToSSEFrame = (frame: ProtocolFrame<OpenAIResponsesStreamEvent>): SseFrame =>
  (frame.type === 'done' ? sseFrame('[DONE]') : sseFrame(JSON.stringify(frame.event), frame.event.type));
