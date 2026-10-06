import { useState } from 'react';
import type { PointerEvent } from 'react';

import { positionOf } from './timeline-axis.tsx';
import type { RecordedChunkSummary } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatBytes } from '../../lib/format-number.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Tooltip } = fluentComponents;

const HEIGHT = 32;
const MIN_BAR = 3;

// One bar per chunk as it arrived on the socket, as tall as its share of the
// largest chunk, so batching by the upstream or a proxy shows as a few tall
// bars where the frames above are many.
export function ChunkTimeline({ chunks, durationMs, label }: { chunks: readonly RecordedChunkSummary[]; durationMs: number; label: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const largest = Math.max(1, ...chunks.map(chunk => chunk.bytes));
  const [hovered, setHovered] = useState<{ index: number; target: Element } | null>(null);

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || chunks.length === 0) return;
    const pointer = ((event.clientX - box.left) / box.width) * 100;
    let nearest = 0;
    for (let index = 1; index < chunks.length; index++) {
      if (Math.abs(positionOf(chunks[index]!.t, durationMs) - pointer) < Math.abs(positionOf(chunks[nearest]!.t, durationMs) - pointer)) nearest = index;
    }
    const target = event.currentTarget.querySelector(`[data-chunk="${nearest}"]`);
    if (target && hovered?.index !== nearest) setHovered({ index: nearest, target });
  };

  const shown = hovered === null ? null : chunks[hovered.index]!;
  return <Tooltip
    content={shown === null ? '' : t('corpus.detail.chunkTooltip', { at: formatDuration(shown.t), size: formatBytes(shown.bytes, locale) })}
    positioning={hovered === null ? undefined : { target: hovered.target, position: 'above' }}
    relationship="description"
    visible={hovered !== null}
    withArrow
  >
    <svg aria-label={label} className="block w-full overflow-visible" height={HEIGHT} onPointerLeave={() => setHovered(null)} onPointerMove={onPointerMove} role="img">
      <line stroke="var(--colorNeutralStroke2)" x1="0" x2="100%" y1={HEIGHT} y2={HEIGHT} />
      {chunks.map((chunk, index) => {
        const height = Math.max(MIN_BAR, (chunk.bytes / largest) * HEIGHT);
        return <rect
          data-bytes={chunk.bytes}
          data-chunk={index}
          fill="var(--colorNeutralForeground3)"
          height={height}
          key={index}
          opacity={hovered === null || hovered.index === index ? 1 : 0.55}
          width={3}
          x={`${positionOf(chunk.t, durationMs)}%`}
          y={HEIGHT - height}
        />;
      })}
    </svg>
  </Tooltip>;
}
