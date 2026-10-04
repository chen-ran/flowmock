// The four API families FlowMock speaks. The identifiers double as the
// package's subpath export names.
export const PROTOCOLS = [
  'anthropic-messages',
  'openai-chat-completions',
  'openai-responses',
  'gemini-generate-content',
] as const;

export type Protocol = (typeof PROTOCOLS)[number];

export const isProtocol = (value: unknown): value is Protocol =>
  typeof value === 'string' && (PROTOCOLS as readonly string[]).includes(value);

// How a response body travels on the wire.
//
// - `sse`: text/event-stream (Anthropic, Chat Completions, Responses over
//   HTTP, Gemini with `alt=sse`).
// - `json-array`: Gemini `streamGenerateContent` without `alt=sse`.
// - `ws`: one JSON text message per event (Responses over WebSocket).
// - `json`: a single non-streaming JSON body.
export const WIRE_FORMATS = ['sse', 'json-array', 'ws', 'json'] as const;

export type WireFormat = (typeof WIRE_FORMATS)[number];
