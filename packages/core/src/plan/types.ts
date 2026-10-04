import type { HeaderList, RecordedChunk } from '../corpus/types.ts';
import type { WireFrameKind } from '../corpus/wire.ts';
import type { Protocol, WireFormat } from '@flowmock/protocols/common';

// Where a frame's bytes came from. The request timeline shows this so an
// operator can tell recorded bytes from rewritten or injected ones.
export type FrameOrigin = 'recorded' | 'rewritten' | 'reencoded' | 'collected' | 'injected';

export interface DraftFrame {
  kind: WireFrameKind;
  // Wire text this frame emits. Authoritative: transforms that change the
  // payload keep `raw`, `data` and `json` in step.
  raw: string;
  data: string | null;
  json: unknown;
  sseEvent?: string;
  done: boolean;
  // Time in the source recording, in milliseconds since dispatch.
  recordedAt: number;
  // Scheduled time, in milliseconds since the request arrived.
  at: number;
  content: boolean;
  contentChars: number;
  // Output tokens attributed to this frame.
  tokens: number;
  origin: FrameOrigin;
}

export type EndMode = 'complete' | 'fin' | 'abort' | 'reset' | 'hang' | 'ws_close' | 'ws_terminate';

export interface EndAction {
  mode: EndMode;
  code?: number;
  reason?: string;
  hangMs?: number;
}

export interface ProvenanceEntry {
  transform: string;
  detail: string;
}

export interface DraftSource {
  recordingId: string | null;
  // The model the recorded request asked for, and the one its response named.
  recordingModel: string | null;
  responseModel: string | null;
}

export interface ReplayDraft {
  protocol: Protocol;
  transport: 'http' | 'ws';
  // Encoding the client expects.
  wire: WireFormat;
  status: number;
  headers: HeaderList;
  headersAt: number;
  // Body units in order. A JSON body is a single `json-body` frame.
  frames: DraftFrame[];
  end: EndAction;
  // When the end action happens; defaults to the last frame's time.
  endAt: number | null;
  outputTokens: number;
  source: DraftSource;
  fidelity: 'normal' | 'raw';
  // `raw` fidelity: recorded chunks with scheduled times, written instead of
  // frames. Null once a transform needs frame-level control.
  rawChunks: Array<RecordedChunk & { at: number }> | null;
  // Old -> new identifiers applied by the rewrite transform.
  idMap: Map<string, string>;
  provenance: ProvenanceEntry[];
}

export interface PlannedWrite {
  // Milliseconds since the request arrived.
  at: number;
  // HTTP writes carry bytes, WebSocket writes one text message.
  bytes?: Uint8Array;
  text?: string;
  // Index of the draft frame this write belongs to, -1 for none.
  frame: number;
  content: boolean;
  // First and last piece of the frame after fragmentation.
  first: boolean;
  last: boolean;
  tokens: number;
}

export interface ReplayPlan {
  transport: 'http' | 'ws';
  status: number;
  headers: HeaderList;
  headersAt: number;
  writes: PlannedWrite[];
  end: EndAction & { at: number };
  outputTokens: number;
  expected: PlanExpectation;
}

export interface PlanExpectation {
  ttftMs: number | null;
  tps: number | null;
  durationMs: number;
}
