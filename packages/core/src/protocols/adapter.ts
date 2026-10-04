import type { WireFrame } from '../corpus/wire.ts';
import type { Protocol } from '@flowmock/protocols/common';

export interface RequestFeatures {
  hasTools: boolean;
  toolNames: string[];
  reasoningRequested: boolean;
  // Characters of conversation text, for input-size buckets.
  inputChars: number;
}

// A request reduced to what identifies the conversation. Segment 0 is the
// header (system prompt and tool definitions); every later segment is one
// turn. Sampling parameters, metadata, cache hints and tool call ids are
// gone, so two runs of the same agent produce the same segments.
export interface NormalizedRequest {
  model: string | null;
  stream: boolean;
  segments: unknown[];
  features: RequestFeatures;
}

export interface NormalizeContext {
  // Model named by the URL rather than the body (Gemini).
  pathModel?: string;
  // Whether the endpoint itself streams (Gemini `streamGenerateContent`).
  pathStream?: boolean;
  // Conversation segments already known for a `previous_response_id`.
  history?: readonly unknown[] | null;
}

export interface FrameInfo {
  // Characters of generated output: text, reasoning, tool arguments.
  contentChars: number;
  // Carries model output, the event that ends time-to-first-token.
  content: boolean;
  // A protocol-level end of stream.
  terminal: boolean;
  error: StreamErrorInfo | null;
}

export interface StreamErrorInfo {
  type: string;
  message: string;
}

export interface ResponseSummary {
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolNames: string[];
  reasoning: boolean;
  responseModel: string | null;
  error: StreamErrorInfo | null;
  // The stream reached a protocol terminal event.
  terminated: boolean;
}

export interface ProtocolAdapter {
  readonly protocol: Protocol;
  normalizeRequest(body: unknown, context?: NormalizeContext): NormalizedRequest;
  frameInfo(frame: WireFrame): FrameInfo;
  summarizeStream(frames: readonly WireFrame[]): ResponseSummary;
  summarizeBody(body: unknown, status: number): ResponseSummary;
  // Reduces a stream's events to the equivalent non-streaming body.
  collect(events: readonly unknown[]): Promise<unknown>;
  encodeBody(body: unknown): string;
  // SSE `event:` name for an event payload, when the protocol names events.
  sseEventName(event: unknown): string | undefined;
  // Adds every response-scoped identifier an event carries.
  collectIds(event: unknown, into: Set<string>): void;
  // JSON keys carrying the model name and unix-second timestamps.
  readonly modelKey: string;
  readonly timeKeys: readonly string[];
  // FlowMock's own diagnostics, in the shape the client's SDK parses.
  errorEnvelope(status: number, type: string, message: string): unknown;
  // A stream-error event carrying `type` and `message`, used when an
  // injected fault names one inline.
  streamErrorEvent?(type: string, message: string): unknown;
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

// Replaces each distinct tool-call id with its order of first appearance, so
// ids minted by the upstream do not break matching across runs.
export class IdOrdinals {
  private readonly ordinals = new Map<string, string>();

  ref(id: unknown): string | null {
    if (typeof id !== 'string' || id === '') return null;
    let ordinal = this.ordinals.get(id);
    if (ordinal === undefined) {
      ordinal = `#${this.ordinals.size + 1}`;
      this.ordinals.set(id, ordinal);
    }
    return ordinal;
  }
}

// Removes every `cache_control` key: cache hints change between runs of the
// same agent without changing the conversation.
export const stripCacheControl = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripCacheControl);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'cache_control').map(([key, v]) => [key, stripCacheControl(v)]));
};

// Parses tool arguments so key order and whitespace do not affect matching.
export const parsedArguments = (value: unknown): unknown => {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

// Large opaque payloads (images, files) are represented by their length and
// a short prefix so they still distinguish turns without bloating segments.
export const opaqueDigest = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return `${text.length}:${text.slice(0, 64)}`;
};

export async function* iterate<T>(items: readonly T[]): AsyncGenerator<T> {
  yield* items;
}
