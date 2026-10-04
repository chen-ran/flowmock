import { commonPrefixLength } from './fingerprint.ts';
import type { CorpusStore } from '../contracts.ts';
import type { RecordingSummary } from '../corpus/types.ts';
import { anyGlobMatches, globMatches } from '../glob.ts';
import type { RequestFeatures } from '../protocols/adapter.ts';
import type { Rng } from '../random.ts';
import type { SampleFilter, Selection } from '../scenario/schema.ts';
import type { Protocol } from '@flowmock/protocols/common';

export interface SelectionRequest {
  protocol: Protocol;
  model: string | null;
  stream: boolean;
  features: RequestFeatures;
  fingerprint: string;
  prefixHashes: readonly string[];
  callIndex: number;
}

export type SelectionReason =
  | { mode: 'exact'; candidates: number }
  | { mode: 'prefix'; prefixLength: number; requestLength: number; candidates: number }
  | { mode: 'sequence'; cassetteId: string; seq: number }
  | { mode: 'sample'; candidates: number; score: number }
  | { mode: 'pinned' };

export type SelectionResult =
  | { kind: 'selected'; recording: RecordingSummary; reason: SelectionReason; misses: string[] }
  | { kind: 'miss'; reason: string; misses: string[] };

// A non-streaming recording cannot answer a streaming request; the reverse
// is served by collecting the stream into a body.
export const canServe = (recording: RecordingSummary, stream: boolean): boolean => !stream || recording.features.stream;

const outcomeAllowed = (outcomes: readonly string[], recording: RecordingSummary): boolean => anyGlobMatches(outcomes, recording.features.outcome);

const sizeBucket = (chars: number): number => (chars < 1_000 ? 0 : chars < 4_000 ? 1 : chars < 16_000 ? 2 : chars < 64_000 ? 3 : 4);

const modelPatterns = (filter: SampleFilter, model: string | null): string[] | null => {
  const mapping = filter.models;
  if (mapping) {
    for (const [key, value] of Object.entries(mapping)) {
      if (key !== '*' && globMatches(key, model)) return Array.isArray(value) ? value : [value];
    }
    const fallback = mapping['*'];
    if (fallback !== undefined) return Array.isArray(fallback) ? fallback : [fallback];
  }
  return model === null ? null : [model];
};

interface Scored {
  recording: RecordingSummary;
  score: number;
}

const scoreCandidate = (recording: RecordingSummary, request: SelectionRequest, patterns: string[] | null): { score: number; modelMatch: boolean; toolsCompatible: boolean; reasoningMatch: boolean } => {
  const features = recording.features;
  const modelMatch = patterns === null || anyGlobMatches(patterns, recording.model) || anyGlobMatches(patterns, features.responseModel);
  // A recording that calls a tool the client never declared would hand the
  // client a call it cannot dispatch.
  const toolsCompatible = features.toolNames.every(name => request.features.toolNames.includes(name));
  const reasoningMatch = features.reasoningRequested === request.features.reasoningRequested;
  const score = (modelMatch ? 4 : 0)
    + (toolsCompatible ? 3 : 0)
    + (features.hasTools === request.features.hasTools ? 2 : 0)
    + (reasoningMatch ? 2 : 0)
    + (sizeBucket(features.inputChars) === sizeBucket(request.features.inputChars) ? 1 : 0);
  return { score, modelMatch, toolsCompatible, reasoningMatch };
};

export const sampleRecording = (
  candidates: readonly RecordingSummary[],
  request: SelectionRequest,
  filter: SampleFilter,
  outcomes: readonly string[],
  rng: Rng,
): { recording: RecordingSummary; score: number; candidates: number } | null => {
  const allowed = filter.outcome === undefined ? outcomes : [filter.outcome];
  const patterns = modelPatterns(filter, request.model);
  const scored: Scored[] = [];
  for (const recording of candidates) {
    if (recording.protocol !== request.protocol || !canServe(recording, request.stream) || !outcomeAllowed(allowed, recording)) continue;
    const { score, modelMatch, toolsCompatible, reasoningMatch } = scoreCandidate(recording, request, patterns);
    if (filter.strict && (!modelMatch || !toolsCompatible || !reasoningMatch)) continue;
    scored.push({ recording, score });
  }
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map(entry => entry.score));
  // Candidates arrive in store order; sorting by id keeps a seeded pick
  // stable however the store happens to list them.
  const top = scored.filter(entry => entry.score === best).map(entry => entry.recording).sort((left, right) => (left.id < right.id ? -1 : 1));
  return { recording: rng.pick(top), score: best, candidates: top.length };
};

const matchRecording = (
  candidates: readonly RecordingSummary[],
  request: SelectionRequest,
  selection: Selection,
  rng: Rng,
): { recording: RecordingSummary; reason: SelectionReason } | null => {
  const eligible = candidates.filter(recording => recording.protocol === request.protocol && canServe(recording, request.stream) && outcomeAllowed(selection.outcomes, recording));
  const exact = eligible.filter(recording => recording.fingerprint === request.fingerprint).sort((left, right) => (left.id < right.id ? -1 : 1));
  if (exact.length > 0) return { recording: rng.pick(exact), reason: { mode: 'exact', candidates: exact.length } };
  if (!selection.prefix) return null;

  let bestLength = 0;
  let best: RecordingSummary[] = [];
  for (const recording of eligible) {
    const length = commonPrefixLength(recording.prefixHashes, request.prefixHashes);
    if (length < selection.minPrefix || length < bestLength) continue;
    if (length > bestLength) {
      bestLength = length;
      best = [];
    }
    best.push(recording);
  }
  if (best.length === 0) return null;
  // Among equal prefixes, prefer the recording whose conversation length is
  // closest to the request's: it stood at the same point of the run.
  const distance = (recording: RecordingSummary) => Math.abs(recording.prefixHashes.length - request.prefixHashes.length);
  const closest = Math.min(...best.map(distance));
  const pool = best.filter(recording => distance(recording) === closest).sort((left, right) => (left.id < right.id ? -1 : 1));
  return {
    recording: rng.pick(pool),
    reason: { mode: 'prefix', prefixLength: bestLength, requestLength: request.prefixHashes.length, candidates: pool.length },
  };
};

const sequenceRecording = async (
  candidates: readonly RecordingSummary[],
  request: SelectionRequest,
  selection: Selection,
  store: CorpusStore,
): Promise<{ recording: RecordingSummary; reason: SelectionReason } | { miss: string; fallback: boolean }> => {
  if (selection.cassette === undefined) return { miss: 'sequence mode needs selection.cassette', fallback: false };
  const cassette = await store.getCassette(selection.cassette);
  if (!cassette) return { miss: `cassette ${selection.cassette} does not exist`, fallback: false };
  const length = cassette.recordingIds.length;
  if (length === 0) return { miss: `cassette ${cassette.id} is empty`, fallback: false };
  let seq = request.callIndex;
  if (seq > length) {
    switch (selection.onEnd) {
    case 'error': return { miss: `call ${seq} is past the end of cassette ${cassette.id} (${length} recordings)`, fallback: false };
    case 'sample': return { miss: `call ${seq} is past the end of cassette ${cassette.id}`, fallback: true };
    case 'loop': seq = ((seq - 1) % length) + 1; break;
    case 'last': seq = length; break;
    }
  }
  const id = cassette.recordingIds[seq - 1];
  const recording = candidates.find(candidate => candidate.id === id);
  if (!recording) return { miss: `cassette ${cassette.id} position ${seq} is not a ${request.protocol} recording`, fallback: false };
  if (!canServe(recording, request.stream)) return { miss: `cassette ${cassette.id} position ${seq} is not streamed but the request streams`, fallback: false };
  return { recording, reason: { mode: 'sequence', cassetteId: cassette.id, seq } };
};

export const selectRecording = async (
  selection: Selection,
  request: SelectionRequest,
  candidates: readonly RecordingSummary[],
  store: CorpusStore,
  rng: Rng,
): Promise<SelectionResult> => {
  const misses: string[] = [];
  const sample = (): SelectionResult => {
    const sampled = sampleRecording(candidates, request, selection.sample, selection.outcomes, rng);
    if (!sampled) {
      misses.push(`no ${request.protocol} recording satisfies the sample filters${request.stream ? ' for a streaming request' : ''}`);
      return { kind: 'miss', reason: misses.join('; '), misses };
    }
    return { kind: 'selected', recording: sampled.recording, reason: { mode: 'sample', candidates: sampled.candidates, score: sampled.score }, misses };
  };

  switch (selection.mode) {
  case 'sample':
    return sample();
  case 'sequence': {
    const result = await sequenceRecording(candidates, request, selection, store);
    if ('recording' in result) return { kind: 'selected', ...result, misses };
    misses.push(result.miss);
    return result.fallback ? sample() : { kind: 'miss', reason: result.miss, misses };
  }
  case 'match':
  case 'match-then-sample': {
    const matched = matchRecording(candidates, request, selection, rng);
    if (matched) return { kind: 'selected', ...matched, misses };
    misses.push('no recording matches the conversation');
    if (selection.mode === 'match-then-sample' || selection.onMiss === 'sample') return sample();
    return { kind: 'miss', reason: misses.join('; '), misses };
  }
  }
};
