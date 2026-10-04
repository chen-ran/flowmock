// Ported from Floway packages/protocols/src/openai-responses/to-result.ts
// (MIT). See NOTICE.md.

import { isOpenAIResponsesTerminalEvent, type OpenAIResponsesResult, type OpenAIResponsesStreamEvent } from './index.ts';
import { reassembleOpenAIResponsesEvents } from './reassemble.ts';
import type { ProtocolFrame } from '../common/sse.ts';

export const OPENAI_RESPONSES_MISSING_TERMINAL_MESSAGE = 'OpenAI Responses stream ended without a terminal event.';

export const collectOpenAIResponsesProtocolEventsToResult = async (frames: AsyncIterable<ProtocolFrame<OpenAIResponsesStreamEvent>>): Promise<OpenAIResponsesResult> => {
  const events = async function* (): AsyncGenerator<OpenAIResponsesStreamEvent> {
    for await (const frame of frames) {
      if (frame.type === 'done') continue;

      yield frame.event;
      if (isOpenAIResponsesTerminalEvent(frame.event)) return;
    }

    throw new Error(OPENAI_RESPONSES_MISSING_TERMINAL_MESSAGE);
  };

  return await reassembleOpenAIResponsesEvents(events());
};
