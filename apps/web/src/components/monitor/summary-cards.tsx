import type { LiveSnapshot } from './use-live.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatNumber, formatTokenRate } from '../../lib/format-number.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { StatTile as Tile } from '../stat-tile.tsx';

// The newest snapshot at a glance.
export function SummaryCards({ snapshot }: { snapshot: LiveSnapshot | undefined }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const protocols = Object.values(snapshot?.byProtocol ?? {});
  const requests = protocols.reduce((sum, item) => sum + item.requests, 0);
  const errors = protocols.reduce((sum, item) => sum + item.errors, 0);
  const faults = Object.values(snapshot?.faults ?? {}).reduce((sum, count) => sum + count, 0);
  const number = (value: number | undefined) => (value === undefined ? NO_READING : formatNumber(value, locale));
  return <div className="grid gap-2.5 grid-cols-6 max-[1100px]:grid-cols-3 max-[560px]:grid-cols-2">
    <Tile label={t('monitor.summary.rps')} value={number(snapshot?.requestsPerSecond)} />
    <Tile label={t('monitor.summary.active')} value={number(snapshot?.activeRequests)} />
    <Tile label={t('monitor.summary.ttft')} value={formatDuration(snapshot?.ttftMs.p50 ?? null)} />
    <Tile label={t('monitor.summary.tps')} value={formatTokenRate(snapshot?.tps.p50 ?? null)} />
    <Tile label={t('monitor.summary.errors')} value={snapshot === undefined ? NO_READING : t('monitor.summary.errorsOf', { errors, requests })} />
    <Tile label={t('monitor.summary.faults')} value={number(snapshot === undefined ? undefined : faults)} />
  </div>;
}
