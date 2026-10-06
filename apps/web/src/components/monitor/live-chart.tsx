// Adapted from Floway apps/web/src/components/performance/chart.tsx (MIT). See NOTICE.md.
import { AreaChart, type CustomizedCalloutData, LineChart } from '@fluentui/react-charts';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

import type { LiveSnapshot } from './use-live.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { ChartCalloutTable } from '@flowmock/ui/charts/callout-table.tsx';
import { useChartFrame } from '@flowmock/ui/charts/frame-styles.ts';
import { ChartHost } from '@flowmock/ui/charts/host.tsx';
import { ChartSection } from '@flowmock/ui/charts/section.tsx';
import { type ChartSeries, withUniqueSeriesLegends } from '@flowmock/ui/charts/series-legends.ts';
import { areaSeries } from '@flowmock/ui/charts/series-plot.ts';
import { visibleSeriesData } from '@flowmock/ui/charts/series-selection.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { makeStyles } = fluentComponents;

// One line of a live chart: a reading taken off every snapshot. A snapshot
// with no reading -- no replay in the minute it covers -- leaves a gap.
export interface LiveSeriesSpec {
  id: string;
  label: string;
  hue: number;
  read: (snapshot: LiveSnapshot) => number | null;
}

const chartMargins = { top: 16, right: 20, bottom: 42, left: 64 } as const;

// The x axis draws its ticks at the plot's full height so they double as
// gridlines, so hit testing passes through them to the series beneath; the
// per-series highlight circle would contradict the callout table, so it loses
// its paint but keeps the box Fluent anchors the callout to. A reading a
// second leaves no bucket worth marking, so the point markers the shared frame
// sizes are not painted either.
const useLiveChartStyles = makeStyles({
  root: {
    '& .fui-cart__xAxis line': { pointerEvents: 'none' },
    '& circle': { visibility: 'hidden' },
  },
});

const SECOND = 1000;
const TICK_STEPS = [5, 10, 15, 30, 60, 120, 300].map(seconds => seconds * SECOND);
const MAX_TICKS = 6;

// Round-numbered ticks for a window of a few seconds to ten minutes: the
// finest step that keeps the axis to a handful of labels. The axis is always
// given its ticks, since Fluent's own add the window's ends, which collide
// with the round ones beside them.
export const liveTicks = (first: number, last: number): { ticks: Date[]; seconds: boolean } => {
  const step = TICK_STEPS.find(candidate => (last - first) / candidate < MAX_TICKS) ?? TICK_STEPS.at(-1)!;
  const ticks: Date[] = [];
  for (let tick = Math.ceil(first / step) * step; tick <= last; tick += step) ticks.push(new Date(tick));
  return { ticks: ticks.length > 0 ? ticks : [new Date(first)], seconds: step < 60 * SECOND };
};

export function LiveChartSection({ emptyText, format, series, snapshots, stacked = false, title }: {
  emptyText: string;
  format: (value: number) => string;
  series: readonly LiveSeriesSpec[];
  snapshots: readonly LiveSnapshot[];
  stacked?: boolean;
  title: string;
}) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(new Set<string>());
  const entries = useMemo(() => withUniqueSeriesLegends(series.map(({ hue, id, label }) => ({ hue, id, label }))), [series]);
  return <ChartSection controlsLabel={t('monitor.series')} emptyText={emptyText} entries={entries} hidden={hidden} onHiddenChange={setHidden} title={title}>
    <LiveChart emptyText={emptyText} entries={entries} format={format} hidden={hidden} series={series} snapshots={snapshots} stacked={stacked} valueLabel={title} />
  </ChartSection>;
}

function LiveChart({ emptyText, entries, format, hidden, series, snapshots, stacked, valueLabel }: {
  emptyText: string;
  entries: readonly ChartSeries[];
  format: (value: number) => string;
  hidden: ReadonlySet<string>;
  series: readonly LiveSeriesSpec[];
  snapshots: readonly LiveSnapshot[];
  stacked: boolean;
  valueLabel: string;
}) {
  const styles = useLiveChartStyles();
  const frame = useChartFrame();
  const locale = useLocale();
  const data = useMemo(() => ({
    lineChartData: entries.flatMap((entry, index) => {
      const points = snapshots.flatMap(snapshot => {
        const value = series[index]!.read(snapshot);
        return value === null ? [] : [{ x: new Date(snapshot.at), y: value }];
      });
      return points.length === 0 ? [] : [areaSeries(entry, points)];
    }),
  }), [entries, series, snapshots]);
  const visible = useMemo(() => visibleSeriesData(entries, data, hidden), [data, entries, hidden]);
  const entryByLegend = useMemo(() => new Map(entries.map(entry => [entry.legend, entry])), [entries]);
  const { seconds, ticks } = liveTicks(snapshots[0]?.at ?? 0, snapshots.at(-1)?.at ?? 0);
  const time = useMemo(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', ...(seconds && { second: '2-digit' }) }), [locale, seconds]);
  const calloutTime = useMemo(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }), [locale]);
  const callout = useCallback((props?: CustomizedCalloutData): ReactElement | null => {
    const rows = (props?.values ?? []).flatMap(item => {
      const entry = entryByLegend.get(item.legend);
      return entry ? [{ color: item.color, key: entry.id, label: entry.label, values: [format(item.y)] }] : [];
    });
    if (rows.length === 0 || props === undefined) return null;
    return <ChartCalloutTable columns={[{ key: 'value', label: valueLabel }]} rows={rows} title={calloutTime.format(props.x instanceof Date ? props.x : new Date(Number(props.x)))} />;
  }, [calloutTime, entryByLegend, format, valueLabel]);

  const shared = {
    customDateTimeFormatter: (date: Date) => time.format(date),
    data: visible,
    enablePerfOptimization: true,
    hideLegend: true,
    margins: chartMargins,
    onRenderCalloutPerStack: callout,
    styles: frame,
    tickValues: ticks,
    yAxisTickFormat: (value: number) => format(value),
  };
  return <ChartHost className={styles.root} emptyText={emptyText} hasData={Boolean(visible.lineChartData?.length)}>
    {({ size }) => {
      const sized = { ...shared, height: size.height, width: size.width, xAxistickSize: -Math.max(0, size.height - chartMargins.top - chartMargins.bottom) };
      return stacked ? <AreaChart {...sized} /> : <LineChart {...sized} />;
    }}
  </ChartHost>;
}
