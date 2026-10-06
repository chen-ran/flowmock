import { requireAccess } from './guards.ts';
import { FaultChart } from '../components/monitor/fault-chart.tsx';
import { SummaryCards } from '../components/monitor/summary-cards.tsx';
import { ThroughputChart } from '../components/monitor/throughput-chart.tsx';
import { TpsChart } from '../components/monitor/tps-chart.tsx';
import { TtftChart } from '../components/monitor/ttft-chart.tsx';
import { useLive } from '../components/monitor/use-live.ts';
import { useTranslation } from '../i18n/translation.ts';
import type { StreamStatus } from '../lib/use-server-events.ts';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { MessageBar, MessageBarBody, MessageBarTitle } = fluentComponents;

export async function clientLoader() {
  await requireAccess();
  return null;
}

const STATUS_TONES = { connecting: 'neutral', live: 'success', reconnecting: 'warning', paused: 'neutral' } as const satisfies Record<StreamStatus, string>;

export default function Monitor() {
  const { t } = useTranslation();
  const { snapshots, status } = useLive();
  return <section className="dashboard-page">
    <DashboardPageHeader
      actions={<StatusBadge tone={STATUS_TONES[status]}>{t(`monitor.status.${status}`)}</StatusBadge>}
      description={t('monitor.description')}
      title={t('nav.monitor')}
    />
    {status === 'reconnecting' && <MessageBar intent="warning">
      <MessageBarBody>
        <MessageBarTitle>{t('monitor.dropped.title')}</MessageBarTitle>
        {t('monitor.dropped.description')}
      </MessageBarBody>
    </MessageBar>}
    <SummaryCards snapshot={snapshots.at(-1)} />
    <div className="grid grid-cols-2 gap-[var(--flowmock-page-inset)] max-[1100px]:grid-cols-1">
      <Panel><TtftChart snapshots={snapshots} /></Panel>
      <Panel><TpsChart snapshots={snapshots} /></Panel>
      <Panel><ThroughputChart snapshots={snapshots} /></Panel>
      <Panel><FaultChart snapshots={snapshots} /></Panel>
    </div>
  </section>;
}
