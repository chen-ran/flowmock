import { sampleDistribution } from '../distribution.ts';
import type { ReplayDraft } from '../plan/types.ts';
import type { Rng } from '../random.ts';
import type { Timing } from '../scenario/schema.ts';

const round = (value: number): number => Math.round(value * 1000) / 1000;

const applyRecorded = (draft: ReplayDraft, scale: number): string => {
  draft.headersAt = round(draft.headersAt * scale);
  for (const frame of draft.frames) frame.at = round(frame.recordedAt * scale);
  if (draft.rawChunks) for (const chunk of draft.rawChunks) chunk.at = round(chunk.t * scale);
  return scale === 1 ? 'recorded intervals' : `recorded intervals x${scale}`;
};

// Places output frames on a schedule derived from a sampled TTFT and decode
// speed:
//
//   at(first output) = TTFT
//   at(output i)     = TTFT + (tokens through i - tokens of first) / TPS
//
// Frames before the first output keep their recorded share of the recorded
// TTFT; non-output frames between outputs are interpolated at their recorded
// relative position; frames after the last output keep their recorded gap.
const applySynthetic = (draft: ReplayDraft, timing: Extract<Timing, { mode: 'synthetic' }>, rng: Rng): string => {
  const ttft = sampleDistribution(timing.ttftMs, rng);
  const tps = sampleDistribution(timing.tps, rng, 0.1);
  const frames = draft.frames;

  if (draft.wire === 'json' && frames.length === 1 && draft.status < 400) {
    const at = round(ttft + (draft.outputTokens / tps) * 1000);
    frames[0].at = at;
    draft.headersAt = at;
    return `non-streaming body at ${at}ms (TTFT ${round(ttft)}ms, ${round(tps)} tok/s)`;
  }

  const content = frames.flatMap((frame, index) => (frame.content ? [index] : []));
  if (content.length === 0) {
    const anchor = frames.at(-1)?.recordedAt ?? draft.headersAt;
    const factor = anchor > 0 ? ttft / anchor : 0;
    draft.headersAt = round(draft.headersAt * factor);
    for (const frame of frames) frame.at = round(frame.recordedAt * factor);
    return `no output frames; recorded schedule fitted to ${round(ttft)}ms`;
  }

  const first = content[0];
  const last = content.at(-1)!;
  const factor = frames[first].recordedAt > 0 ? ttft / frames[first].recordedAt : 0;
  draft.headersAt = round(Math.min(ttft, draft.headersAt * factor));
  for (let index = 0; index < first; index++) frames[index].at = round(Math.min(ttft, frames[index].recordedAt * factor));

  let cumulative = 0;
  let previous = 0;
  for (const index of content) {
    cumulative += frames[index].tokens;
    const ideal = ttft + ((cumulative - frames[first].tokens) / tps) * 1000;
    const noisy = index === first || timing.jitterMs === 0 ? ideal : ideal + rng.normal() * timing.jitterMs;
    previous = Math.max(previous, index === first ? ideal : noisy);
    frames[index].at = round(previous);
  }

  for (let position = 0; position < content.length - 1; position++) {
    const from = content[position];
    const to = content[position + 1];
    const span = frames[to].recordedAt - frames[from].recordedAt;
    for (let index = from + 1; index < to; index++) {
      const share = span > 0 ? (frames[index].recordedAt - frames[from].recordedAt) / span : 0;
      frames[index].at = round(frames[from].at + share * (frames[to].at - frames[from].at));
    }
  }

  for (let index = last + 1; index < frames.length; index++) {
    frames[index].at = round(frames[last].at + Math.max(0, frames[index].recordedAt - frames[last].recordedAt));
  }

  return `TTFT ${round(ttft)}ms, ${round(tps)} tok/s over ${round(draft.outputTokens)} output tokens`;
};

export const applyTiming = (draft: ReplayDraft, timing: Timing, rng: Rng): void => {
  if (timing.mode === 'synthetic' && draft.rawChunks) {
    draft.provenance.push({ transform: 'timing', detail: `${applyRecorded(draft, 1)}; synthetic timing needs frame fidelity` });
    return;
  }
  const detail = timing.mode === 'recorded' ? applyRecorded(draft, timing.scale) : applySynthetic(draft, timing, rng);
  draft.provenance.push({ transform: 'timing', detail });
};
