import { useState } from 'react';
import type { PointerEvent } from 'react';

import { positionOf } from './timeline-axis.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Tooltip } = fluentComponents;

// One write on a timeline: a recorded frame, or a frame a replay plan writes.
// Content marks the output a client renders; error marks a frame that reports
// a failure, which outranks content. The kind sets a mark's height, and its
// colour unless the mark names one -- a replayed frame is coloured by where
// its bytes came from.
export interface TimelineMark {
  t: number;
  kind: 'content' | 'other' | 'error';
  color?: string;
  title: string;
  detail: string | null;
}

const HEIGHT = 32;
const markHeight = { content: 24, other: 12, error: HEIGHT } as const;
const markColor = {
  content: 'var(--colorBrandStroke1)',
  other: 'var(--colorNeutralStrokeAccessible)',
  error: 'var(--winui-system-fill-critical)',
} as const;

// Ordered by arrival so the nearest mark under the pointer is found by its
// position alone.
export function FrameTimeline({ durationMs, label, marks }: { durationMs: number; label: string; marks: readonly TimelineMark[] }) {
  const ordered = [...marks].map((mark, index) => ({ ...mark, index })).sort((a, b) => a.t - b.t || a.index - b.index);
  const [hovered, setHovered] = useState<{ index: number; target: Element } | null>(null);

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || ordered.length === 0) return;
    const pointer = ((event.clientX - box.left) / box.width) * 100;
    let nearest = 0;
    for (let index = 1; index < ordered.length; index++) {
      if (Math.abs(positionOf(ordered[index]!.t, durationMs) - pointer) < Math.abs(positionOf(ordered[nearest]!.t, durationMs) - pointer)) nearest = index;
    }
    const target = event.currentTarget.querySelector(`[data-mark="${nearest}"]`);
    if (target && hovered?.index !== nearest) setHovered({ index: nearest, target });
  };

  const shown = hovered === null ? null : ordered[hovered.index]!;
  return <Tooltip
    content={shown === null ? '' : <span className="grid gap-1 max-w-[420px]">
      <strong>{shown.title}</strong>
      {shown.detail && <code className="whitespace-pre-wrap break-all">{shown.detail}</code>}
    </span>}
    positioning={hovered === null ? undefined : { target: hovered.target, position: 'above' }}
    relationship="description"
    visible={hovered !== null}
    withArrow
  >
    <svg
      aria-label={label}
      className="block w-full overflow-visible"
      height={HEIGHT}
      onPointerLeave={() => setHovered(null)}
      onPointerMove={onPointerMove}
      role="img"
    >
      <line stroke="var(--colorNeutralStroke2)" x1="0" x2="100%" y1={HEIGHT} y2={HEIGHT} />
      {ordered.map((mark, index) => <rect
        data-error={mark.kind === 'error' || undefined}
        data-kind={mark.kind}
        data-mark={index}
        data-t={mark.t}
        fill={mark.color ?? markColor[mark.kind]}
        height={markHeight[mark.kind]}
        key={mark.index}
        opacity={hovered === null || hovered.index === index ? 1 : 0.55}
        width={2}
        x={`${positionOf(mark.t, durationMs)}%`}
        y={HEIGHT - markHeight[mark.kind]}
      />)}
    </svg>
  </Tooltip>;
}
