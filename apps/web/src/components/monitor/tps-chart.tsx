import { LiveChartSection, type LiveSeriesSpec } from './live-chart.tsx';
import { QUANTILE_HUES } from './ttft-chart.tsx';
import type { LiveSnapshot } from './use-live.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatTokenRate } from '../../lib/format-number.ts';

// formatTokenRate reads zero as no reading; on the axis it is the floor.
const rate = (value: number) => (value === 0 ? '0' : formatTokenRate(value));

// Output speed over the last minute, at three quantiles.
export function TpsChart({ snapshots }: { snapshots: readonly LiveSnapshot[] }) {
  const { t } = useTranslation();
  const series: LiveSeriesSpec[] = (['p50', 'p90', 'p99'] as const).map(quantile => ({
    id: quantile,
    label: t(`monitor.quantiles.${quantile}`),
    hue: QUANTILE_HUES[quantile],
    read: snapshot => snapshot.tps[quantile],
  }));
  return <LiveChartSection emptyText={t('monitor.noReplays')} format={rate} series={series} snapshots={snapshots} title={t('monitor.charts.tps')} />;
}
