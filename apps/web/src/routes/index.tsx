import { useLoaderData, useRevalidator } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import { SummaryCards } from '../components/monitor/summary-cards.tsx';
import { useLive } from '../components/monitor/use-live.ts';
import { RequestList } from '../components/requests/list.tsx';
import { summaryOf } from '../components/requests/summary.ts';
import { StatTile } from '../components/stat-tile.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { formatBytes, formatNumber } from '../lib/format-number.ts';
import { outcomeTone } from '../lib/outcome.ts';
import { useLocale } from '../lib/use-locale.ts';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { EmptyState } from '@flowmock/ui/controls/empty-state.tsx';
import { PANEL_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { ResourceListActions, ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

const RECENT = 10;

export async function clientLoader() {
  await requireAccess();
  const [stats, recent] = await Promise.all([
    callApi(() => api.stats.$get()),
    callApi(() => api.requests.$get({ query: { limit: String(RECENT) } })),
  ]);
  return {
    stats: stats.data ?? null,
    recent: recent.data?.items.map(summaryOf) ?? null,
    error: stats.error?.message ?? recent.error?.message ?? null,
  };
}

type Breakdown = Array<{ label: string; recordings: number; bytes: number; tone?: Parameters<typeof outcomeTone>[0] }>;

function BreakdownTable({ label, rows, title }: { label: string; rows: Breakdown; title: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return <Table aria-label={title} size="small">
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{label}</TableHeaderCell>
        <TableHeaderCell className="w-[110px]">{t('overview.corpus.recordings')}</TableHeaderCell>
        <TableHeaderCell className="w-[110px]">{t('overview.corpus.bytes')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map(row => <TableRow key={row.label}>
        <TableCell>{row.tone === undefined ? <span className="block truncate">{row.label}</span> : <StatusBadge tone={outcomeTone(row.tone)}>{row.label}</StatusBadge>}</TableCell>
        <TableCell><span className="tabular-nums">{formatNumber(row.recordings, locale)}</span></TableCell>
        <TableCell><span className="tabular-nums">{formatBytes(row.bytes, locale)}</span></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}

// What the corpus holds, what is happening now, and what just happened.
export default function Overview() {
  const { error, recent, stats } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const locale = useLocale();
  const revalidator = useRevalidator();
  const { snapshots } = useLive();

  return <section className="dashboard-page">
    <DashboardPageHeader
      actions={<ResourceListActions onRefresh={() => void revalidator.revalidate()} refreshLabel={t('overview.refresh')} refreshing={revalidator.state === 'loading'} />}
      description={t('overview.description')}
      title={t('nav.overview')}
    />
    {error && <OutcomeMessageBar title={t('overview.loadFailed')}>{error}</OutcomeMessageBar>}

    {stats && <div className={PANEL_STACK_CLASS}>
      <SectionHeader actions={<RouteLink to="/corpus">{t('overview.corpus.browse')}</RouteLink>} description={t('overview.corpus.description')} level={2} title={t('overview.corpus.title')} />
      {stats.recordings === 0
        ? <Panel><EmptyState description={t('overview.corpus.empty.description')} title={t('overview.corpus.empty.title')} /></Panel>
        : <>
            <div className="grid gap-2.5 grid-cols-4 max-[900px]:grid-cols-2">
              <StatTile label={t('overview.corpus.recordings')} value={formatNumber(stats.recordings, locale)} />
              <StatTile label={t('overview.corpus.bytes')} value={formatBytes(stats.bytes, locale)} />
              <StatTile label={t('overview.corpus.protocols')} value={formatNumber(stats.byProtocol.length, locale)} />
              <StatTile label={t('overview.corpus.models')} value={formatNumber(stats.byModel.length, locale)} />
            </div>
            <div className="grid grid-cols-2 gap-[var(--flowmock-page-inset)] max-[1100px]:grid-cols-1">
              <Panel padding="flush">
                <BreakdownTable label={t('overview.corpus.protocol')} rows={stats.byProtocol.map(row => ({ label: row.protocol, recordings: row.recordings, bytes: row.bytes }))} title={t('overview.corpus.byProtocol')} />
              </Panel>
              <Panel padding="flush">
                <BreakdownTable label={t('overview.corpus.outcome')} rows={stats.byOutcome.map(row => ({ label: row.outcome, recordings: row.recordings, bytes: row.bytes, tone: row.outcome }))} title={t('overview.corpus.byOutcome')} />
              </Panel>
            </div>
          </>}
    </div>}

    <div className={PANEL_STACK_CLASS}>
      <SectionHeader actions={<RouteLink to="/monitor">{t('overview.live.open')}</RouteLink>} description={t('overview.live.description')} level={2} title={t('overview.live.title')} />
      <SummaryCards snapshot={snapshots.at(-1)} />
    </div>

    {recent && <div className={PANEL_STACK_CLASS}>
      <SectionHeader actions={<RouteLink to="/requests">{t('overview.recent.all')}</RouteLink>} description={t('overview.recent.description', { count: RECENT })} level={2} title={t('overview.recent.title')} />
      {recent.length === 0
        ? <Panel><EmptyState description={t('requests.empty.description')} title={t('requests.empty.title')} /></Panel>
        : <ResourceListPanel><RequestList items={recent} /></ResourceListPanel>}
    </div>}
  </section>;
}
