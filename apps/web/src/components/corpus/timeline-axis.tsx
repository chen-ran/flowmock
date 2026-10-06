import type { ReactNode } from 'react';

import { formatDuration } from '../../lib/format-duration.ts';

// The lanes of one exchange share a horizontal axis, so a frame, the chunk it
// arrived in and the tokens it carried line up vertically. Every position is a
// percentage of the exchange's duration, which keeps the lanes aligned at any
// width without measuring one.
export const positionOf = (t: number, durationMs: number): number =>
  durationMs <= 0 ? 0 : Math.min(100, Math.max(0, (t / durationMs) * 100));

// 1, 2 or 5 times a power of ten, so tick labels read as round durations.
const niceStep = (span: number, target: number): number => {
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
};

export const axisTicks = (durationMs: number, target = 6): number[] => {
  if (!(durationMs > 0)) return [0];
  const step = niceStep(durationMs, target);
  const ticks: number[] = [];
  for (let index = 0; index * step <= durationMs * (1 + 1e-9); index++) ticks.push(index * step);
  return ticks;
};

// A lane's frame: its name on the left, its plot on the right, the axis
// labels under the last lane only.
export function TimelineLane({ children, label }: { children: ReactNode; label: string }) {
  return <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 max-[680px]:grid-cols-1 max-[680px]:gap-1">
    <span className="text-fui-base200 text-fui-fg2">{label}</span>
    <div className="relative min-w-0">{children}</div>
  </div>;
}

export function TimelineAxis({ durationMs }: { durationMs: number }) {
  const ticks = axisTicks(durationMs);
  return <TimelineLane label="">
    <div aria-hidden="true" className="relative h-5 border-t border-t-solid border-fui-divider">
      {ticks.map((tick, index) => <span
        className="absolute top-1 text-fui-base200 text-fui-fg3 whitespace-nowrap"
        key={tick}
        style={{ left: `${positionOf(tick, durationMs)}%`, transform: index === 0 ? undefined : index === ticks.length - 1 && positionOf(tick, durationMs) > 95 ? 'translateX(-100%)' : 'translateX(-50%)' }}
      >{formatDuration(tick)}</span>)}
    </div>
  </TimelineLane>;
}
