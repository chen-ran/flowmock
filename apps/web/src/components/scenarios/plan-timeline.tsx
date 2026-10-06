import type { PreviewPlan, PreviewTrace } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { FrameTimeline, type TimelineMark } from '../corpus/frame-timeline.tsx';
import { positionOf, TimelineAxis, TimelineLane } from '../corpus/timeline-axis.tsx';

// A moment of the plan drawn across the writes lane: when the status line
// goes out, when the first token is expected, and how the response ends.
export interface PlanMoment {
  id: 'headers' | 'ttft' | 'end';
  t: number;
  color: string;
}

const ABNORMAL_ENDS: ReadonlySet<string> = new Set(['abort', 'reset', 'hang', 'ws_terminate']);

export const planMoments = (plan: PreviewPlan): PlanMoment[] => [
  { id: 'headers', t: plan.headersAt, color: 'var(--colorNeutralForeground3)' },
  ...(plan.expected.ttftMs === null ? [] : [{ id: 'ttft' as const, t: plan.expected.ttftMs, color: 'var(--colorBrandForeground1)' }]),
  { id: 'end', t: plan.end.at, color: ABNORMAL_ENDS.has(plan.end.mode) ? 'var(--winui-system-fill-critical)' : 'var(--colorNeutralForeground2)' },
];

// The axis spans every write and every moment, so none falls off the end.
export const planDuration = (plan: PreviewPlan): number =>
  Math.max(1, plan.end.at, plan.headersAt, plan.expected.ttftMs ?? 0, ...plan.writes.map(write => write.at));

// A write is content when it carries output the client renders. Every write of
// a refused response, and every write of a frame a fault injected, reports a
// failure.
export const planMarks = (plan: PreviewPlan, trace: PreviewTrace, title: (write: PreviewPlan['writes'][number]) => string): TimelineMark[] =>
  plan.writes.map(write => ({
    t: write.at,
    kind: plan.status >= 400 || trace.frames[write.frame]?.origin === 'injected' ? 'error' : write.content ? 'content' : 'other',
    title: title(write),
    detail: write.text === '' ? null : write.text,
  }));

export function PlanTimeline({ plan, trace }: { plan: PreviewPlan; trace: PreviewTrace }) {
  const { t } = useTranslation();
  const durationMs = planDuration(plan);
  const moments = planMoments(plan);
  const marks = planMarks(plan, trace, write => t('scenarios.preview.write', { at: formatDuration(write.at), bytes: write.bytes }));
  const kinds = new Set(marks.map(mark => mark.kind));
  const momentLabel = (moment: PlanMoment) => moment.id === 'end'
    ? t('scenarios.preview.moments.end', { mode: t(`scenarios.preview.endModes.${plan.end.mode}`), at: formatDuration(moment.t) })
    : t(`scenarios.preview.moments.${moment.id}`, { at: formatDuration(moment.t) });
  return <div className="grid gap-3">
    <div className="grid gap-1">
      <TimelineLane label={t('scenarios.preview.writesLane', { count: plan.writes.length })}>
        <FrameTimeline
          durationMs={durationMs}
          label={t('scenarios.preview.writesLane', { count: plan.writes.length })}
          marks={marks}
        />
        {moments.map(moment => <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-l-dashed"
          data-moment={moment.id}
          key={moment.id}
          style={{ left: `${positionOf(moment.t, durationMs)}%`, borderLeftColor: moment.color }}
        />)}
      </TimelineLane>
      <TimelineAxis durationMs={durationMs} />
    </div>
    <ul aria-label={t('scenarios.preview.momentsLabel')} className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1 text-fui-base200 text-fui-fg2">
      {kinds.has('content') && <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-[2px] h-3 bg-[var(--colorBrandStroke1)]" />{t('scenarios.preview.legend.content')}</li>}
      {kinds.has('other') && <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-[2px] h-2 bg-[var(--colorNeutralStrokeAccessible)]" />{t('scenarios.preview.legend.other')}</li>}
      {kinds.has('error') && <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-[2px] h-3 bg-[var(--winui-system-fill-critical)]" />{t('scenarios.preview.legend.error')}</li>}
      {moments.map(moment => <li className="flex items-center gap-2" key={moment.id}>
        <span aria-hidden="true" className="inline-block h-3 border-l-2 border-l-dashed" style={{ borderLeftColor: moment.color }} />
        {momentLabel(moment)}
      </li>)}
    </ul>
  </div>;
}
