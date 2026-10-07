import { LiveChartSection, type LiveSeriesSpec } from './live-chart.tsx';
import type { LiveSnapshot } from './use-live.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatNumber } from '../../lib/format-number.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { FAULT_TYPES } from '../scenarios/form/model.ts';

const FAULT_HUES = { http_error: 28, stream_error_event: 75, interrupt: 300, concurrency_limit: 200 } as const;

// Faults injected over the last minute, stacked by type. Only the types seen
// in the window get a series.
export function FaultChart({ snapshots }: { snapshots: readonly LiveSnapshot[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const seen = FAULT_TYPES.filter(type => snapshots.some(snapshot => (snapshot.faults[type] ?? 0) > 0));
  const series: LiveSeriesSpec[] = seen.map(type => ({
    id: type,
    label: t(`scenarios.form.faults.types.${type}`),
    hue: FAULT_HUES[type],
    read: snapshot => snapshot.faults[type] ?? 0,
  }));
  return <LiveChartSection emptyText={t('monitor.noFaults')} format={value => formatNumber(value, locale)} series={series} snapshots={snapshots} stacked title={t('monitor.charts.faults')} />;
}
