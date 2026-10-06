import type { ReactNode } from 'react';

import { positionOf } from './timeline-axis.tsx';

// A moment drawn across a lane: when the status line went out, when the first
// token was due or came, how the response ended.
export interface TimelineMoment {
  id: string;
  t: number;
  color: string;
  label: string;
}

// Dashed lines over the lane they are placed in, which must be positioned.
export function MomentLines({ durationMs, moments }: { durationMs: number; moments: readonly TimelineMoment[] }) {
  return <>{moments.map(moment => <span
    aria-hidden="true"
    className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-l-dashed"
    data-moment={moment.id}
    key={moment.id}
    style={{ left: `${positionOf(moment.t, durationMs)}%`, borderLeftColor: moment.color }}
  />)}</>;
}

export interface LegendItem {
  key: string;
  // A bar for a kind of mark, a dash for a moment.
  swatch: 'bar' | 'dash';
  color: string;
  label: ReactNode;
}

export function TimelineLegend({ items, label }: { items: readonly LegendItem[]; label: string }) {
  return <ul aria-label={label} className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1 text-fui-base200 text-fui-fg2">
    {items.map(item => <li className="flex items-center gap-2" key={item.key}>
      <span
        aria-hidden="true"
        className={item.swatch === 'bar' ? 'inline-block w-[2px] h-3' : 'inline-block h-3 border-l-2 border-l-dashed'}
        style={item.swatch === 'bar' ? { backgroundColor: item.color } : { borderLeftColor: item.color }}
      />
      {item.label}
    </li>)}
  </ul>;
}

export const momentLegend = (moments: readonly TimelineMoment[]): LegendItem[] =>
  moments.map(moment => ({ key: moment.id, swatch: 'dash', color: moment.color, label: moment.label }));
