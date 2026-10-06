import { LiveChartSection, type LiveSeriesSpec } from './live-chart.tsx';
import type { LiveSnapshot } from './use-live.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatNumber } from '../../lib/format-number.ts';
import { useLocale } from '../../lib/use-locale.ts';

// Requests per second over the last ten seconds, and requests in flight.
export function ThroughputChart({ snapshots }: { snapshots: readonly LiveSnapshot[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const series: LiveSeriesSpec[] = [
    { id: 'rps', label: t('monitor.throughput.rps'), hue: 251, read: snapshot => snapshot.requestsPerSecond },
    { id: 'active', label: t('monitor.throughput.active'), hue: 144, read: snapshot => snapshot.activeRequests },
  ];
  return <LiveChartSection emptyText={t('monitor.waiting')} format={value => formatNumber(value, locale)} series={series} snapshots={snapshots} title={t('monitor.charts.throughput')} />;
}
