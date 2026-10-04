import type { Protocol, WireFormat } from '@flowmock/protocols/common';

// `ok`, `http_error:<status>`, `stream_error:<type>`, `truncated`,
// `client_aborted`, or `network_error`.
export type Outcome = string;

export interface RecordedChunk {
  // Milliseconds since the request was dispatched upstream.
  t: number;
  bytes: Uint8Array;
}

export type HeaderList = Array<[string, string]>;

export interface RecordedRequest {
  method: string;
  // Path and query as the client sent them.
  path: string;
  // Credentials are redacted before the request is stored.
  headers: HeaderList;
  body: unknown;
}

export interface RecordedResponse {
  status: number;
  headers: HeaderList;
  // Milliseconds since dispatch at which the status line arrived.
  headersAt: number;
  wire: WireFormat;
  // Body bytes in arrival order. A WebSocket turn stores one chunk per
  // server message.
  chunks: RecordedChunk[];
  // Whether the upstream finished the body normally.
  complete: boolean;
  // Milliseconds since dispatch at which the body ended or was cut.
  endedAt: number;
}

export interface RecordingFeatures {
  stream: boolean;
  outcome: Outcome;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: number;
  // Names of the tools the response called.
  toolNames: string[];
  reasoning: boolean;
  // Request-side features used by sampling.
  hasTools: boolean;
  requestToolNames: string[];
  reasoningRequested: boolean;
  inputChars: number;
  ttftMs: number | null;
  tps: number | null;
  durationMs: number;
  responseModel: string | null;
  frames: number;
  bytes: number;
}

export interface Recording {
  id: string;
  // Epoch milliseconds.
  createdAt: number;
  protocol: Protocol;
  transport: 'http' | 'ws';
  // The model the client asked for.
  model: string | null;
  request: RecordedRequest;
  response: RecordedResponse;
  features: RecordingFeatures;
  fingerprint: string;
  prefixHashes: string[];
  sessionId: string | null;
  cassetteId: string | null;
  // 1-based position inside the cassette.
  cassetteSeq: number | null;
}

export type RecordingSummary = Omit<Recording, 'request' | 'response'> & {
  status: number;
  wire: WireFormat;
};

export interface Cassette {
  id: string;
  name: string;
  createdAt: number;
  // Recording ids ordered by sequence.
  recordingIds: string[];
}

export const summarizeRecording = (recording: Recording): RecordingSummary => {
  const { request: _request, response, ...rest } = recording;
  return { ...rest, status: response.status, wire: response.wire };
};
