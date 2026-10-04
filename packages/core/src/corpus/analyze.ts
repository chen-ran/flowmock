import type { Outcome, RecordedResponse, RecordingFeatures } from './types.ts';
import { bodyText, decodeWireFrames, type WireFrame } from './wire.ts';
import type { FrameInfo, NormalizedRequest, ProtocolAdapter, ResponseSummary } from '../protocols/adapter.ts';

// Spreads `total` output tokens over frames in proportion to the generated
// characters each carries.
export const allocateTokens = (chars: readonly number[], total: number): number[] => {
  const sum = chars.reduce((acc, value) => acc + value, 0);
  if (sum === 0) return chars.map(() => 0);
  return chars.map(value => (total * value) / sum);
};

// Roughly four characters per token for English-heavy output; only used when
// the upstream reported no usage.
export const estimateTokens = (chars: number): number => Math.ceil(chars / 4);

export interface StreamTimingStats {
  ttftMs: number | null;
  tps: number | null;
}

// TTFT is the arrival of the first frame that carries output. TPS excludes
// that first frame's tokens and divides the rest by the time between the
// first and last output frames, which is what a synthetic schedule built
// from the same two numbers reproduces exactly.
export const streamTimingStats = (frames: readonly WireFrame[], infos: readonly FrameInfo[], outputTokens: number): StreamTimingStats => {
  const contentIndexes = infos.flatMap((info, index) => (info.content ? [index] : []));
  if (contentIndexes.length === 0) return { ttftMs: null, tps: null };
  const tokens = allocateTokens(infos.map(info => info.contentChars), outputTokens);
  const first = contentIndexes[0];
  const last = contentIndexes.at(-1)!;
  const elapsed = frames[last].t - frames[first].t;
  const decoded = outputTokens - tokens[first];
  return { ttftMs: frames[first].t, tps: elapsed > 0 && decoded > 0 ? (decoded * 1000) / elapsed : null };
};

const parseBody = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

export interface ResponseAnalysis {
  frames: WireFrame[];
  infos: FrameInfo[];
  summary: ResponseSummary;
  outcome: Outcome;
}

const classifyOutcome = (response: RecordedResponse, summary: ResponseSummary): Outcome => {
  if (response.status >= 400) return `http_error:${response.status}`;
  if (summary.error) return `stream_error:${summary.error.type}`;
  if (!response.complete || !summary.terminated) return 'truncated';
  return 'ok';
};

export const analyzeResponse = (adapter: ProtocolAdapter, response: RecordedResponse): ResponseAnalysis => {
  const frames = decodeWireFrames(response.wire, response.chunks);
  const infos = frames.map(frame => adapter.frameInfo(frame));
  const isError = response.status >= 400;
  const summary = isError || response.wire === 'json'
    ? adapter.summarizeBody(parseBody(bodyText(response.chunks)), response.status)
    : adapter.summarizeStream(frames);
  return { frames, infos, summary, outcome: classifyOutcome(response, summary) };
};

export const recordingFeatures = (adapter: ProtocolAdapter, response: RecordedResponse, normalized: NormalizedRequest): RecordingFeatures => {
  const { frames, infos, summary, outcome } = analyzeResponse(adapter, response);
  const stream = response.wire !== 'json' && response.status < 400;
  const contentChars = infos.reduce((sum, info) => sum + info.contentChars, 0);
  const timing = stream
    ? streamTimingStats(frames, infos, summary.outputTokens ?? estimateTokens(contentChars))
    : { ttftMs: null, tps: null };
  return {
    stream,
    outcome,
    stopReason: summary.stopReason,
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    toolCalls: summary.toolNames.length,
    toolNames: summary.toolNames,
    reasoning: summary.reasoning,
    hasTools: normalized.features.hasTools,
    requestToolNames: normalized.features.toolNames,
    reasoningRequested: normalized.features.reasoningRequested,
    inputChars: normalized.features.inputChars,
    ttftMs: timing.ttftMs,
    tps: timing.tps,
    durationMs: response.endedAt,
    responseModel: summary.responseModel,
    frames: frames.length,
    bytes: response.chunks.reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0),
  };
};
