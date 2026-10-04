// Ported from Floway packages/protocols/src/openai-chat-completions/stream.ts
// (MIT). See NOTICE.md.

import type { OpenAIChatCompletionsStreamEvent } from './index.ts';
import { parseTargetStreamFrames } from '../common/parse-events.ts';
import { parseSSEStream } from '../common/parse-sse.ts';
import { doneFrame, eventFrame, type ProtocolFrame } from '../common/sse.ts';

export interface ParseOpenAIChatCompletionsStreamOptions {
  signal?: AbortSignal;
}

// Unlike Floway's gateway parser, a mid-stream `{error: {...}}` chunk is
// yielded as an ordinary event: to a recorder it is data worth keeping, and
// `openaiChatCompletionsErrorPayloadMessage` identifies it for callers that
// need to stop on it.
export const parseOpenAIChatCompletionsStream = (
  body: ReadableStream<Uint8Array>,
  options: ParseOpenAIChatCompletionsStreamOptions = {},
): AsyncGenerator<ProtocolFrame<OpenAIChatCompletionsStreamEvent>> => (async function* () {
  for await (const frame of parseTargetStreamFrames<OpenAIChatCompletionsStreamEvent>(parseSSEStream(body, options), {
    protocol: 'OpenAI Chat Completions',
  })) {
    if (frame.type === 'done') {
      yield doneFrame();
      return;
    }
    yield eventFrame(frame.data);
  }
})();
