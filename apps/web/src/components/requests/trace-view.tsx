import type { RequestDetail } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { FrameTimeline, type TimelineMark } from '../corpus/frame-timeline.tsx';
import { TimelineAxis, TimelineLane } from '../corpus/timeline-axis.tsx';
import { type LegendItem, momentLegend, MomentLines, TimelineLegend, type TimelineMoment } from '../corpus/timeline-moments.tsx';
import { colorForHue } from '@flowmock/ui/charts/palette.ts';

type Trace = NonNullable<RequestDetail['trace']>;
type Frame = Trace['frames'][number];

// Where a frame's bytes came from: as recorded, rewritten (ids, model), encoded
// afresh, collected from a stream into one body, or injected by a fault.
export const ORIGINS = ['recorded', 'rewritten', 'reencoded', 'collected', 'injected'] as const;
export type Origin = typeof ORIGINS[number];

export const ORIGIN_COLORS: Record<Origin, string> = {
  recorded: 'var(--colorNeutralStrokeAccessible)',
  rewritten: 'var(--colorBrandStroke1)',
  reencoded: colorForHue(300),
  collected: colorForHue(170),
  injected: 'var(--winui-system-fill-critical)',
};

const ABNORMAL_ENDS: ReadonlySet<string> = new Set(['abort', 'reset', 'hang', 'ws_terminate']);

const originOf = (frame: Frame): Origin => ((ORIGINS as readonly string[]).includes(frame.origin) ? frame.origin as Origin : 'recorded');

// A frame's height is its kind, its colour where its bytes came from.
export const traceMarks = (frames: readonly Frame[], describe: (frame: Frame, origin: Origin) => { title: string; detail: string }): TimelineMark[] =>
  frames.map(frame => {
    const origin = originOf(frame);
    return { t: frame.at, kind: origin === 'injected' ? 'error' : frame.content ? 'content' : 'other', color: ORIGIN_COLORS[origin], ...describe(frame, origin) };
  });

export const traceDuration = (entry: Pick<RequestDetail, 'expected' | 'result' | 'trace'>): number =>
  Math.max(1, entry.result?.endedAt ?? 0, entry.expected?.durationMs ?? 0, ...(entry.trace?.frames ?? []).map(frame => frame.at));

// The frames a replay planned, coloured by origin, with the first token as
// planned and as measured, and the end of the response.
export function TraceView({ entry }: { entry: Pick<RequestDetail, 'expected' | 'result' | 'trace'> & { trace: Trace } }) {
  const { t } = useTranslation();
  const durationMs = traceDuration(entry);
  const frames = entry.trace.frames;
  const marks = traceMarks(frames, (frame, origin) => ({
    title: frame.label ?? t(`requests.origins.${origin}`),
    detail: t('requests.trace.frameDetail', { origin: t(`requests.origins.${origin}`), at: formatDuration(frame.at), bytes: frame.bytes, tokens: frame.tokens }),
  }));
  const moments: TimelineMoment[] = [
    ...(entry.expected?.ttftMs == null ? [] : [{ id: 'planned', t: entry.expected.ttftMs, color: 'var(--colorBrandForeground1)', label: t('requests.trace.plannedTtft', { at: formatDuration(entry.expected.ttftMs) }) }]),
    ...(entry.result?.achievedTtftMs == null ? [] : [{ id: 'achieved', t: entry.result.achievedTtftMs, color: colorForHue(144), label: t('requests.trace.achievedTtft', { at: formatDuration(entry.result.achievedTtftMs) }) }]),
    ...(entry.result === null ? [] : [{
      id: 'end',
      t: entry.result.endedAt,
      color: ABNORMAL_ENDS.has(entry.result.endMode) ? 'var(--winui-system-fill-critical)' : 'var(--colorNeutralForeground2)',
      label: t('requests.trace.end', { mode: t(`scenarios.preview.endModes.${entry.result.endMode}`), at: formatDuration(entry.result.endedAt) }),
    }]),
  ];
  const seen = new Set(frames.map(originOf));
  const legend: LegendItem[] = [
    ...ORIGINS.filter(origin => seen.has(origin)).map(origin => ({ key: origin, swatch: 'bar' as const, color: ORIGIN_COLORS[origin], label: t(`requests.origins.${origin}`) })),
    ...momentLegend(moments),
  ];
  return <div className="grid gap-3">
    <div className="grid gap-1">
      <TimelineLane label={t('requests.trace.framesLane', { count: frames.length })}>
        <FrameTimeline durationMs={durationMs} label={t('requests.trace.framesLane', { count: frames.length })} marks={marks} />
        <MomentLines durationMs={durationMs} moments={moments} />
      </TimelineLane>
      <TimelineAxis durationMs={durationMs} />
    </div>
    <TimelineLegend items={legend} label={t('requests.trace.legend')} />
  </div>;
}
