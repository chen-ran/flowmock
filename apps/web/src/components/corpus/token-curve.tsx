import { positionOf } from './timeline-axis.tsx';
import type { RecordingFrame } from '../../api/types.ts';

export interface TokenPoint {
  t: number;
  tokens: number;
}

// The running total of output tokens as each content frame arrived, a step at
// every frame. The server apportions the recording's output tokens over its
// content frames by their share of the text, with the same total its TTFT and
// TPS were measured with, so the curve ends at that total.
export const cumulativeTokens = (frames: readonly Pick<RecordingFrame, 't' | 'tokens'>[]): TokenPoint[] => {
  const points: TokenPoint[] = [{ t: 0, tokens: 0 }];
  let total = 0;
  for (const frame of [...frames].sort((a, b) => a.t - b.t)) {
    if (frame.tokens <= 0) continue;
    points.push({ t: frame.t, tokens: total });
    total += frame.tokens;
    points.push({ t: frame.t, tokens: total });
  }
  return points;
};

const HEIGHT = 64;
const WIDTH = 1000;

// Drawn in a fixed coordinate space stretched to the lane's width, with a
// stroke that does not stretch, so it lines up with the percentage-placed
// marks of the lanes above.
export function TokenCurve({ durationMs, frames, label }: { durationMs: number; frames: readonly Pick<RecordingFrame, 't' | 'tokens'>[]; label: string }) {
  const points = cumulativeTokens(frames);
  const total = points.at(-1)!.tokens;
  const end = { t: durationMs, tokens: total };
  const path = [...points, end].map(point => `${(positionOf(point.t, durationMs) / 100) * WIDTH},${total > 0 ? HEIGHT - (point.tokens / total) * HEIGHT : HEIGHT}`).join(' ');
  return <svg aria-label={label} className="block w-full overflow-visible" data-total={total} height={HEIGHT} preserveAspectRatio="none" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
    <line stroke="var(--colorNeutralStroke2)" vectorEffect="non-scaling-stroke" x1="0" x2={WIDTH} y1={HEIGHT} y2={HEIGHT} />
    <polyline fill="none" points={path} stroke="var(--colorBrandStroke1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
  </svg>;
}
