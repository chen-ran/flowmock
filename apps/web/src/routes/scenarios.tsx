import { Delete20Regular } from '@fluentui/react-icons';
import { useState } from 'react';
import { useLoaderData, useNavigate, useRevalidator } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi, callApiNoContent } from '../api/client.ts';
import type { ScenarioSummary } from '../api/types.ts';
import { useTranslation } from '../i18n/translation.ts';
import { compactDateTime } from '../lib/format-time.ts';
import { NO_READING } from '../lib/no-reading.ts';
import { useLocale } from '../lib/use-locale.ts';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { useOutcomeToasts } from '@flowmock/ui/controls/outcome-toast.tsx';
import { ResourceListActions, ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { TABLE_ACTIONS_WIDTH, TableActions, TableTrailingCell, TableTrailingHeader } from '@flowmock/ui/controls/table-actions.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { TooltipIconButton } from '@flowmock/ui/controls/tooltip-icon-button.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

export async function clientLoader() {
  await requireAccess();
  const result = await callApi(() => api.scenarios.$get());
  return { items: result.data?.items ?? null, error: result.error?.message ?? null };
}

const COLUMN_WIDTHS = ['220px', null, '180px', '80px', '96px', '136px', TABLE_ACTIONS_WIDTH];

function ScenarioList({ items, onDelete }: { items: readonly ScenarioSummary[]; onDelete: (item: ScenarioSummary) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return <Table aria-label={t('nav.scenarios')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('scenarios.list.name')}</TableHeaderCell>
        <TableHeaderCell>{t('scenarios.list.description')}</TableHeaderCell>
        <TableHeaderCell>{t('scenarios.list.timing')}</TableHeaderCell>
        <TableHeaderCell>{t('scenarios.list.faults')}</TableHeaderCell>
        <TableHeaderCell>{t('scenarios.list.kind')}</TableHeaderCell>
        <TableHeaderCell>{t('scenarios.list.updated')}</TableHeaderCell>
        <TableTrailingHeader>{t('scenarios.list.actions')}</TableTrailingHeader>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(item => <TableRow key={item.name}>
        <TableCell><span className="block truncate"><RouteLink to={`/scenarios/${encodeURIComponent(item.name)}`}>{item.name}</RouteLink></span></TableCell>
        <TableCell><span className="block truncate">{item.scenario.description ?? NO_READING}</span></TableCell>
        <TableCell><span className="block truncate">{item.scenario.timing.mode === 'recorded'
          ? t('scenarios.list.recordedTiming', { scale: item.scenario.timing.scale })
          : t('scenarios.list.syntheticTiming')}</span></TableCell>
        <TableCell>{item.scenario.faults.length}</TableCell>
        <TableCell>{item.builtIn
          ? <StatusBadge tone="neutral">{t('scenarios.kind.builtIn')}</StatusBadge>
          : <StatusBadge tone="accent">{t('scenarios.kind.custom')}</StatusBadge>}</TableCell>
        <TableCell>{item.builtIn ? NO_READING : compactDateTime(item.updatedAt, locale)}</TableCell>
        <TableTrailingCell>
          <TableActions>
            {!item.builtIn && <TooltipIconButton danger icon={<Delete20Regular />} label={t('scenarios.actions.delete')} onClick={() => onDelete(item)} />}
          </TableActions>
        </TableTrailingCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}

export default function Scenarios() {
  const { error, items } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const toasts = useOutcomeToasts();
  const [deleting, setDeleting] = useState<ScenarioSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const remove = async (item: ScenarioSummary) => {
    const result = await callApiNoContent(() => api.scenarios[':name'].$delete({ param: { name: item.name } }));
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    setActionError(null);
    toasts.succeed(t('scenarios.delete.done'));
    await revalidator.revalidate();
  };

  return <section className="dashboard-page">
    <DashboardPageHeader
      actions={<ResourceListActions
        createLabel={t('scenarios.actions.create')}
        onCreate={() => void navigate('/scenarios/new')}
        onRefresh={() => void revalidator.revalidate()}
        refreshLabel={t('scenarios.refresh')}
        refreshing={revalidator.state === 'loading'}
      />}
      description={t('scenarios.description')}
      title={t('nav.scenarios')}
    />
    {error && <OutcomeMessageBar title={t('scenarios.loadFailed')}>{error}</OutcomeMessageBar>}
    {actionError && <OutcomeMessageBar onDismiss={() => setActionError(null)} title={t('scenarios.actionFailed')}>{actionError}</OutcomeMessageBar>}
    {items !== null && <ResourceListPanel><ScenarioList items={items} onDelete={setDeleting} /></ResourceListPanel>}

    <ConfirmDialog
      actionLabel={t('scenarios.actions.delete')}
      message={t('scenarios.delete.message')}
      onConfirm={() => {
        const item = deleting;
        setDeleting(null);
        if (item) void remove(item);
      }}
      onOpenChange={open => { if (!open) setDeleting(null); }}
      open={deleting !== null}
      title={t('scenarios.delete.title', { name: deleting?.name ?? '' })}
    />
  </section>;
}
