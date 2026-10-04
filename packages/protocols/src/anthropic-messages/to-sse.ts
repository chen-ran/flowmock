import type { AnthropicMessagesStreamEvent } from './index.ts';
import { type ProtocolFrame, type SseFrame, sseFrame } from '../common/sse.ts';

// Anthropic names every SSE block after its JSON `type`. FlowMock replays the
// event objects it recorded, so they already carry the wire spelling and are
// serialized as they are.
// https://docs.anthropic.com/en/docs/build-with-claude/streaming#event-types
export const anthropicMessagesProtocolFrameToSSEFrame = (frame: ProtocolFrame<AnthropicMessagesStreamEvent>): SseFrame | null =>
  (frame.type === 'event' ? sseFrame(JSON.stringify(frame.event), frame.event.type) : null);
