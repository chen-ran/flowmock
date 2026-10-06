import { LiveChartSection, type LiveSeriesSpec } from './live-chart.tsx';
import type { LiveSnapshot } from './use-live.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';

export const QUANTILE_HUES = { p50: 251, p90: 144, p99: 28 } as const;

// Time to first token over the last minute, at three quantiles.
export function TtftChart({ snapshots }: { snapshots: readonly LiveSnapshot[] }) {
  const { t } = useTranslation();
  const series: LiveSeriesSpec[] = (['p50', 'p90', 'p99'] as const).map(quantile => ({
    id: quantile,
    label: t(`monitor.quantiles.${quantile}`),
    hue: QUANTILE_HUES[quantile],
    read: snapshot => snapshot.ttftMs[quantile],
  }));
  return <LiveChartSection emptyText={t('monitor.noReplays')} format={formatDuration} series={series} snapshots={snapshots} title={t('monitor.charts.ttft')} />;
}
