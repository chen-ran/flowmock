import type { PreviewPlan, PreviewTrace } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { FrameTimeline, type TimelineMark } from '../corpus/frame-timeline.tsx';
import { TimelineAxis, TimelineLane } from '../corpus/timeline-axis.tsx';
import { type LegendItem, momentLegend, MomentLines, TimelineLegend, type TimelineMoment } from '../corpus/timeline-moments.tsx';

// The moments of the plan drawn across the writes lane: when the status line
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
  const marks = planMarks(plan, trace, write => t('scenarios.preview.write', { at: formatDuration(write.at), bytes: write.bytes }));
  const kinds = new Set(marks.map(mark => mark.kind));
  const moments: TimelineMoment[] = planMoments(plan).map(moment => ({
    ...moment,
    label: moment.id === 'end'
      ? t('scenarios.preview.moments.end', { mode: t(`scenarios.preview.endModes.${plan.end.mode}`), at: formatDuration(moment.t) })
      : t(`scenarios.preview.moments.${moment.id}`, { at: formatDuration(moment.t) }),
  }));
  const legend: LegendItem[] = [
    ...(kinds.has('content') ? [{ key: 'content', swatch: 'bar' as const, color: 'var(--colorBrandStroke1)', label: t('scenarios.preview.legend.content') }] : []),
    ...(kinds.has('other') ? [{ key: 'other', swatch: 'bar' as const, color: 'var(--colorNeutralStrokeAccessible)', label: t('scenarios.preview.legend.other') }] : []),
    ...(kinds.has('error') ? [{ key: 'error', swatch: 'bar' as const, color: 'var(--winui-system-fill-critical)', label: t('scenarios.preview.legend.error') }] : []),
    ...momentLegend(moments),
  ];
  return <div className="grid gap-3">
    <div className="grid gap-1">
      <TimelineLane label={t('scenarios.preview.writesLane', { count: plan.writes.length })}>
        <FrameTimeline durationMs={durationMs} label={t('scenarios.preview.writesLane', { count: plan.writes.length })} marks={marks} />
        <MomentLines durationMs={durationMs} moments={moments} />
      </TimelineLane>
      <TimelineAxis durationMs={durationMs} />
    </div>
    <TimelineLegend items={legend} label={t('scenarios.preview.momentsLabel')} />
  </div>;
}
