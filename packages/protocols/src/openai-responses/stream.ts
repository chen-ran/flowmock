// Ported from Floway packages/protocols/src/openai-responses/stream.ts (MIT),
// without the gateway's fast-path expansion and sequence backfilling: a
// recorder keeps events exactly as the upstream sent them. See NOTICE.md.

import type { OpenAIResponsesStreamEvent } from './index.ts';
import { parseTargetStreamFrames } from '../common/parse-events.ts';
import { parseSSEStream } from '../common/parse-sse.ts';
import { doneFrame, eventFrame, type ProtocolFrame } from '../common/sse.ts';

export interface ParseOpenAIResponsesStreamOptions {
  signal?: AbortSignal;
}

// Some upstreams emit the event type only via the SSE `event:` header and
// leave it off the JSON body; re-attach it so consumers see one shape.
const projectSseJsonEvent = (event: OpenAIResponsesStreamEvent, eventName: string | undefined): OpenAIResponsesStreamEvent =>
  eventName && !(event as { type?: string }).type ? ({ ...event, type: eventName } as OpenAIResponsesStreamEvent) : event;

export const parseOpenAIResponsesStream = (
  body: ReadableStream<Uint8Array>,
  options: ParseOpenAIResponsesStreamOptions = {},
): AsyncGenerator<ProtocolFrame<OpenAIResponsesStreamEvent>> => (async function* () {
  for await (const frame of parseTargetStreamFrames<OpenAIResponsesStreamEvent>(parseSSEStream(body, options), {
    protocol: 'OpenAI Responses',
    malformedJsonEventName: 'response',
  })) {
    if (frame.type === 'done') {
      yield doneFrame();
      return;
    }
    yield eventFrame(projectSseJsonEvent(frame.data, frame.frame.event));
  }
})();
