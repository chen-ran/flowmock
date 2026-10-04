import type { CorpusStore } from './contracts.ts';
import type { HeaderList, RecordedResponse, Recording, RecordingSummary } from './corpus/types.ts';
import { decodeWireFrames } from './corpus/wire.ts';
import { globMatches } from './glob.ts';
import { draftFromBody, draftFromRecording } from './plan/draft.ts';
import { encodePlan } from './plan/encode.ts';
import type { FrameOrigin, ProvenanceEntry, ReplayDraft, ReplayPlan } from './plan/types.ts';
import type { NormalizedRequest } from './protocols/adapter.ts';
import { isObject } from './protocols/adapter.ts';
import { openaiResponsesAdapter } from './protocols/openai-responses.ts';
import { adapterFor } from './protocols/registry.ts';
import { createRng, type Rng } from './random.ts';
import type { Fault, FaultRule, Scenario } from './scenario/schema.ts';
import { triggerMatches, type TriggerContext } from './scenario/triggers.ts';
import { deriveSessionId, type Fingerprint, fingerprintSegments } from './selection/fingerprint.ts';
import { type SelectionReason, selectRecording } from './selection/select.ts';
import { applyInterrupt, applyStreamErrorEvent } from './transforms/faults.ts';
import { applyNetwork } from './transforms/network.ts';
import { compileTransforms, type CompiledTransform, type TransformContext } from './transforms/registry.ts';
import { applyRewrite } from './transforms/rewrite.ts';
import { applyTiming } from './transforms/timing.ts';
import type { Protocol, WireFormat } from '@flowmock/protocols/common';

export interface PrepareInput {
  protocol: Protocol;
  transport: 'http' | 'ws';
  body: unknown;
  // Encoding of a streamed body; Gemini picks `sse` or `json-array` by URL.
  streamWire?: WireFormat;
  pathModel?: string;
  pathStream?: boolean;
  // Raw conversation items a `previous_response_id` refers to.
  history?: readonly unknown[] | null;
  // `x-flowmock-session`, when the client named its session.
  session?: string | null;
}

export interface PreparedRequest {
  protocol: Protocol;
  transport: 'http' | 'ws';
  stream: boolean;
  // Encoding the client expects for a successful body.
  wire: WireFormat;
  body: unknown;
  normalized: NormalizedRequest;
  fingerprint: Fingerprint;
  sessionId: string;
  // Responses only: every raw item the conversation holds after this
  // request, for `previous_response_id` continuations.
  conversationItems: unknown[] | null;
}

// Normalizes, fingerprints and sessions a request. Recording and replay call
// this identically, so a replayed request matches the recording made from the
// same client request.
export const prepareRequest = (input: PrepareInput): PreparedRequest => {
  const adapter = adapterFor(input.protocol);
  const normalized = adapter.normalizeRequest(input.body, { pathModel: input.pathModel, pathStream: input.pathStream, history: input.history ?? null });
  const stream = input.transport === 'ws' || normalized.stream;
  const wire: WireFormat = input.transport === 'ws' ? 'ws' : stream ? input.streamWire ?? 'sse' : 'json';
  const fingerprint = fingerprintSegments(input.protocol, normalized.segments);
  const conversationItems = input.protocol === 'openai-responses' ? openaiResponsesAdapter.conversationItems(input.body, input.history) : null;
  return {
    protocol: input.protocol,
    transport: input.transport,
    stream,
    wire,
    body: input.body,
    normalized,
    fingerprint,
    sessionId: input.session ?? deriveSessionId(input.protocol, normalized.segments),
    conversationItems,
  };
};

export interface ReplayContext {
  scenario: Scenario;
  // 1-based call number inside the session.
  callIndex: number;
  seed: string;
  // Epoch milliseconds.
  nowMs: number;
  // Milliseconds since the scenario's epoch, for time-window triggers.
  scenarioElapsedMs: number;
  // Requests in flight for the key, this one included.
  inFlight: number;
}

export interface TraceFrame {
  at: number;
  origin: FrameOrigin;
  content: boolean;
  tokens: number;
  label: string | null;
  bytes: number;
}

export interface ReplayTrace {
  scenario: string;
  seed: string;
  sessionId: string;
  callIndex: number;
  fingerprint: string;
  selection: SelectionReason | null;
  misses: string[];
  recordingId: string | null;
  fault: { rule: number; type: Fault['type'] } | null;
  provenance: ProvenanceEntry[];
  frames: TraceFrame[];
  error: { code: string; message: string } | null;
}

export interface ReplayOutcome {
  plan: ReplayPlan;
  trace: ReplayTrace;
  // Responses only: the conversation this response completes, keyed by the
  // response id the client saw.
  conversation: { responseId: string; items: unknown[] } | null;
}

export class FlowMockReplayError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MAX_TRACE_FRAMES = 2000;

const traceFrames = (draft: ReplayDraft): TraceFrame[] => draft.frames.slice(0, MAX_TRACE_FRAMES).map(frame => ({
  at: frame.at,
  origin: frame.origin,
  content: frame.content,
  tokens: Math.round(frame.tokens * 100) / 100,
  label: frame.sseEvent ?? (isObject(frame.json) && typeof frame.json.type === 'string' ? frame.json.type : frame.done ? '[DONE]' : frame.kind === 'trailer' ? 'trailer' : null),
  bytes: frame.raw.length,
}));

const triggered = (rules: readonly FaultRule[], context: TriggerContext, inFlight: number, rngFor: (index: number) => Rng): { rule: FaultRule; index: number } | null => {
  for (const [index, rule] of rules.entries()) {
    if (rule.inject.type === 'concurrency_limit' && inFlight <= rule.inject.max) continue;
    if (triggerMatches(rule.when, context, rngFor(index))) return { rule, index };
  }
  return null;
};

const errorSampleFilter = (candidates: readonly RecordingSummary[], protocol: Protocol, from: { outcome?: string; model?: string } | undefined, defaultOutcome: string) =>
  candidates.filter(candidate => candidate.protocol === protocol
    && globMatches(from?.outcome ?? defaultOutcome, candidate.features.outcome)
    && (from?.model === undefined || globMatches(from.model, candidate.model)))
    .sort((left, right) => (left.id < right.id ? -1 : 1));

const loadSample = async (
  store: CorpusStore,
  candidates: readonly RecordingSummary[],
  protocol: Protocol,
  from: { outcome?: string; model?: string; recording?: string } | undefined,
  defaultOutcome: string,
  rng: Rng,
): Promise<Recording | null> => {
  if (from?.recording !== undefined) {
    const recording = await store.getRecording(from.recording);
    return recording?.protocol === protocol ? recording : null;
  }
  const pool = errorSampleFilter(candidates, protocol, from, defaultOutcome);
  return pool.length === 0 ? null : await store.getRecording(rng.pick(pool).id);
};

const DEFAULT_ERROR_TYPES: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  408: 'timeout_error',
  413: 'request_too_large',
  429: 'rate_limit_error',
  500: 'api_error',
  502: 'api_error',
  503: 'overloaded_error',
  504: 'timeout_error',
  529: 'overloaded_error',
};

const mergeHeaders = (base: HeaderList, overrides: Record<string, string> | undefined): HeaderList => {
  if (!overrides) return base;
  const names = new Set(Object.keys(overrides).map(name => name.toLowerCase()));
  return [...base.filter(([name]) => !names.has(name.toLowerCase())), ...Object.entries(overrides).map(([name, value]) => [name.toLowerCase(), value] as [string, string])];
};

const httpErrorDraft = async (
  fault: Extract<Fault, { type: 'http_error' | 'concurrency_limit' }>,
  request: PreparedRequest,
  candidates: readonly RecordingSummary[],
  store: CorpusStore,
  rng: Rng,
): Promise<ReplayDraft> => {
  const adapter = adapterFor(request.protocol);
  // A sample must agree with the status the client will see, so an explicit
  // status narrows the default sample to that status.
  const defaultOutcome = fault.status !== undefined ? `http_error:${fault.status}` : fault.type === 'concurrency_limit' ? 'http_error:429' : 'http_error:*';
  const sample = await loadSample(store, candidates, request.protocol, fault.from, defaultOutcome, rng);
  const overrideBody = fault.body === undefined ? undefined : typeof fault.body === 'string' ? fault.body : JSON.stringify(fault.body);
  if (sample) {
    const body = overrideBody ?? new TextDecoder().decode(concatBytes(sample.response.chunks.map(chunk => chunk.bytes)));
    const draft = draftFromBody({
      protocol: request.protocol,
      transport: request.transport,
      status: fault.status ?? sample.response.status,
      headers: mergeHeaders(sample.response.headers, fault.headers),
      body,
      delayMs: fault.delayMs ?? sample.response.headersAt,
      recordingId: sample.id,
      origin: overrideBody === undefined ? 'recorded' : 'injected',
    });
    draft.provenance.push({ transform: fault.type, detail: `HTTP ${draft.status} from recording ${sample.id}${fault.status !== undefined || fault.headers || overrideBody !== undefined ? ' with overrides' : ''}` });
    return draft;
  }
  const status = fault.status ?? (fault.type === 'concurrency_limit' ? 429 : undefined);
  if (status === undefined) {
    throw new FlowMockReplayError('no_error_sample', 500, `No ${request.protocol} recording with outcome ${fault.from?.outcome ?? defaultOutcome} exists; record one or give the fault an explicit status.`);
  }
  const type = DEFAULT_ERROR_TYPES[status] ?? (status >= 500 ? 'api_error' : 'invalid_request_error');
  const body = overrideBody ?? JSON.stringify(adapter.errorEnvelope(status, type, `Injected HTTP ${status} (FlowMock scenario fault).`));
  const draft = draftFromBody({
    protocol: request.protocol,
    transport: request.transport,
    status,
    headers: mergeHeaders([['content-type', 'application/json']], fault.headers),
    body,
    delayMs: fault.delayMs ?? 0,
    recordingId: null,
    origin: 'injected',
  });
  draft.provenance.push({ transform: fault.type, detail: `HTTP ${status} from scenario overrides (no recorded sample)` });
  return draft;
};

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
};

const streamErrorEvents = async (
  fault: Extract<Fault, { type: 'stream_error_event' }>,
  request: PreparedRequest,
  candidates: readonly RecordingSummary[],
  store: CorpusStore,
  rng: Rng,
): Promise<{ events: unknown[]; label: string }> => {
  if (fault.event !== undefined) return { events: [fault.event], label: 'inline' };
  const adapter = adapterFor(request.protocol);
  const sample = await loadSample(store, candidates, request.protocol, fault.from, 'stream_error:*', rng);
  if (sample) {
    const frames = decodeWireFrames(sample.response.wire, sample.response.chunks);
    const error = frames.find(frame => adapter.frameInfo(frame).error !== null);
    if (error) return { events: [error.json], label: `recording ${sample.id}` };
  }
  throw new FlowMockReplayError('no_error_sample', 500, `No ${request.protocol} recording with outcome ${fault.from?.outcome ?? 'stream_error:*'} carries an error event; record one or give the fault an inline event.`);
};

const errorOutcome = (request: PreparedRequest, context: ReplayContext, error: FlowMockReplayError, trace: ReplayTrace): ReplayOutcome => {
  const adapter = adapterFor(request.protocol);
  const draft = draftFromBody({
    protocol: request.protocol,
    transport: request.transport,
    status: error.status,
    headers: [['content-type', 'application/json'], ['x-flowmock-error', error.code]],
    body: JSON.stringify(adapter.errorEnvelope(error.status, `flowmock_${error.code}`, `FlowMock: ${error.message}`)),
    delayMs: 0,
    recordingId: null,
    origin: 'injected',
  });
  return {
    plan: encodePlan(draft),
    trace: { ...trace, scenario: context.scenario.name, error: { code: error.code, message: error.message }, frames: traceFrames(draft) },
    conversation: null,
  };
};

const runExtras = (extras: readonly CompiledTransform[], stage: 'content' | 'timing' | 'fault', draft: ReplayDraft, context: TransformContext): void => {
  for (const extra of extras) {
    if (extra.definition.stage === stage) extra.definition.apply(draft, extra.config as never, context);
  }
};

const responsesConversation = (request: PreparedRequest, draft: ReplayDraft): ReplayOutcome['conversation'] => {
  if (request.protocol !== 'openai-responses' || draft.status >= 400 || request.conversationItems === null) return null;
  let response: Record<string, unknown> | null = null;
  for (const frame of draft.frames) {
    const json = frame.json;
    if (!isObject(json)) continue;
    if (json.object === 'response') response = json;
    else if (isObject(json.response)) response = json.response;
  }
  if (!response || typeof response.id !== 'string') return null;
  return { responseId: response.id, items: [...request.conversationItems, ...openaiResponsesAdapter.outputItems(response)] };
};

export const planReplay = async (request: PreparedRequest, context: ReplayContext, store: CorpusStore): Promise<ReplayOutcome> => {
  const { scenario } = context;
  const adapter = adapterFor(request.protocol);
  const rngFor = (purpose: string, ...extra: Array<string | number>): Rng => createRng(context.seed, purpose, request.sessionId, context.callIndex, ...extra);
  const trace: ReplayTrace = {
    scenario: scenario.name,
    seed: context.seed,
    sessionId: request.sessionId,
    callIndex: context.callIndex,
    fingerprint: request.fingerprint.fingerprint,
    selection: null,
    misses: [],
    recordingId: null,
    fault: null,
    provenance: [],
    frames: [],
    error: null,
  };

  try {
    let extras: CompiledTransform[];
    try {
      extras = compileTransforms(scenario.transforms);
    } catch (error) {
      throw new FlowMockReplayError('invalid_scenario', 500, error instanceof Error ? error.message : String(error));
    }
    const transformContext: TransformContext = { adapter, rng: rngFor('transform'), requestModel: request.normalized.model, nowSeconds: Math.floor(context.nowMs / 1000) };
    const candidates = await store.listCandidates(request.protocol);
    const fired = triggered(scenario.faults, {
      callIndex: context.callIndex,
      protocol: request.protocol,
      model: request.normalized.model,
      stream: request.stream,
      hasTools: request.normalized.features.hasTools,
      elapsedMs: context.scenarioElapsedMs,
    }, context.inFlight, index => rngFor('trigger', index));
    if (fired) trace.fault = { rule: fired.index, type: fired.rule.inject.type };

    let draft: ReplayDraft;
    const fault = fired?.rule.inject;
    if (fault && (fault.type === 'http_error' || fault.type === 'concurrency_limit')) {
      draft = await httpErrorDraft(fault, request, candidates, store, rngFor('fault-sample'));
      trace.recordingId = draft.source.recordingId;
    } else {
      const selection = await selectRecording(scenario.selection, {
        protocol: request.protocol,
        model: request.normalized.model,
        stream: request.stream,
        features: request.normalized.features,
        fingerprint: request.fingerprint.fingerprint,
        prefixHashes: request.fingerprint.prefixHashes,
        callIndex: context.callIndex,
      }, candidates, store, rngFor('select'));
      trace.misses = selection.misses;
      if (selection.kind === 'miss') throw new FlowMockReplayError('no_recording', 404, selection.reason);
      trace.selection = selection.reason;
      trace.recordingId = selection.recording.id;
      const recording = await store.getRecording(selection.recording.id);
      if (!recording) throw new FlowMockReplayError('no_recording', 404, `recording ${selection.recording.id} disappeared from the corpus`);

      draft = await draftFromRecording(recording, {
        protocol: request.protocol,
        transport: request.transport,
        wire: request.wire,
        stream: request.stream,
        fidelity: scenario.fidelity,
      }, adapter);

      applyRewrite(draft, scenario.rewrite, transformContext);
      runExtras(extras, 'content', draft, transformContext);
      applyTiming(draft, scenario.timing, rngFor('timing'));
      runExtras(extras, 'timing', draft, transformContext);
      if (fault?.type === 'interrupt') applyInterrupt(draft, fault);
      if (fault?.type === 'stream_error_event') {
        const { events, label } = await streamErrorEvents(fault, request, candidates, store, rngFor('fault-sample'));
        applyStreamErrorEvent(draft, fault, events, adapter, label);
      }
      runExtras(extras, 'fault', draft, transformContext);
    }

    const plan = encodePlan(draft);
    const networkNotes = applyNetwork(plan, scenario.network, rngFor('network'));
    if (networkNotes.length > 0) draft.provenance.push({ transform: 'network', detail: networkNotes.join('; ') });
    for (const extra of extras) {
      if (extra.definition.stage !== 'network') continue;
      const notes = extra.definition.apply(plan, extra.config as never, transformContext);
      draft.provenance.push({ transform: extra.definition.type, detail: notes.join('; ') || 'applied' });
    }
    plan.expected = { ...plan.expected, durationMs: plan.end.at };
    trace.provenance = draft.provenance;
    trace.frames = traceFrames(draft);
    return { plan, trace, conversation: responsesConversation(request, draft) };
  } catch (error) {
    if (error instanceof FlowMockReplayError) return errorOutcome(request, context, error, trace);
    throw error;
  }
};

// The conversation behind a recorded Responses exchange, keyed by the id the
// upstream returned, so a recorded `previous_response_id` continuation
// fingerprints like a full resend.
export const recordedConversation = (prepared: PreparedRequest, response: RecordedResponse): { responseId: string; items: unknown[] } | null => {
  if (prepared.protocol !== 'openai-responses' || prepared.conversationItems === null || response.status >= 400) return null;
  const frames = decodeWireFrames(response.wire, response.chunks);
  const body = frames.length === 1 && frames[0].kind === 'json-body' ? frames[0].json : null;
  const terminal = isObject(body) && body.object === 'response' ? body : openaiResponsesAdapter.terminalResponse(frames);
  if (!terminal || typeof terminal.id !== 'string') return null;
  return { responseId: terminal.id, items: [...prepared.conversationItems, ...openaiResponsesAdapter.outputItems(terminal)] };
};
