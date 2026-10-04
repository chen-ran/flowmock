// The engine reaches its runtime through these three contracts so that every
// timing decision can be exercised against a fake clock and a fake transport.

import type { Cassette, Recording, RecordingSummary } from './corpus/types.ts';
import type { Protocol } from '@flowmock/protocols/common';

export interface Clock {
  // Monotonic milliseconds. Only differences are meaningful.
  now(): number;
  // Resolves at or after `deadline` (a `now()` value), or rejects with the
  // signal's reason once it aborts.
  sleepUntil(deadline: number, signal?: AbortSignal): Promise<void>;
}

// An HTTP response under the runner's byte-level control.
export interface HttpTransport {
  // Aborts when the client goes away.
  readonly signal: AbortSignal;
  writeHead(status: number, headers: ReadonlyArray<readonly [string, string]>): void;
  // Resolves once the bytes are handed to the socket and any backpressure has
  // drained.
  write(bytes: Uint8Array): Promise<void>;
  // Completes the HTTP response normally.
  end(): Promise<void>;
  // Closes the connection with a FIN without completing the HTTP message, so
  // the client sees a truncated body.
  abort(): void;
  // Closes the connection with a TCP RST.
  reset(): void;
}

// A WebSocket turn under the runner's control.
export interface MessageTransport {
  readonly signal: AbortSignal;
  send(text: string): Promise<void>;
  close(code: number, reason: string): void;
  // Drops the connection without a close frame.
  terminate(): void;
}

export interface CorpusStore {
  // Lightweight rows for selection; full bodies are loaded on demand.
  listCandidates(protocol: Protocol): Promise<readonly RecordingSummary[]>;
  getRecording(id: string): Promise<Recording | null>;
  getCassette(id: string): Promise<Cassette | null>;
}
