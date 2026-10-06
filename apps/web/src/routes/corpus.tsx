import { useState } from 'react';
import { useLoaderData, useRevalidator, useSearchParams } from 'react-router';

import type { Route } from './+types/corpus';
import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import type { RecordingSummary } from '../api/types.ts';
import { CorpusFilters, type CorpusFilterValues } from '../components/corpus/filters.tsx';
import { RecordingList } from '../components/corpus/list.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { EmptyState } from '@flowmock/ui/controls/empty-state.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { useOutcomeToasts } from '@flowmock/ui/controls/outcome-toast.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { ResourceListActions, ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';
import { useEntryRewrite } from '@flowmock/ui/page-navigation';

const { Button, Text } = fluentComponents;

const PAGE_SIZE = 100;

const filtersFrom = (search: URLSearchParams): CorpusFilterValues => ({
  protocol: search.get('protocol') ?? '',
  outcome: search.get('outcome') ?? '',
  model: search.get('model') ?? '',
  q: search.get('q') ?? '',
});

const queryFor = (search: URLSearchParams, before?: string) => {
  const filters = filtersFrom(search);
  return {
    limit: String(PAGE_SIZE),
    ...(filters.protocol && { protocol: filters.protocol as never }),
    ...(filters.outcome && { outcome: filters.outcome }),
    ...(filters.model && { model: filters.model }),
    ...(filters.q && { q: filters.q }),
    ...(search.get('cassette') && { cassette: search.get('cassette')! }),
    ...(before && { before }),
  };
};

// A failed fetch is reported as one, never as an empty corpus: an empty list
// would tell the reader to go and record traffic they may already have.
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  await requireAccess();
  const search = new URL(request.url).searchParams;
  const result = await callApi(() => api.recordings.$get({ query: queryFor(search) }));
  return { page: result.data ?? null, error: result.error?.message ?? null };
}

export default function Corpus() {
  const { page, error } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const rewrite = useEntryRewrite();
  const revalidator = useRevalidator();
  const toasts = useOutcomeToasts();
  // Pages fetched past the first, tied to the loader result they extend, so a
  // new filter or a refresh starts from its own first page.
  const [more, setMore] = useState<{ source: typeof page; items: RecordingSummary[]; error: string | null }>({ source: page, items: [], error: null });
  const extra = more.source === page ? more : { source: page, items: [], error: null };
  const items = page === null ? [] : [...page.items, ...extra.items];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const filters = filtersFrom(search);
  const cassette = search.get('cassette');
  const shownSelection = [...selected].filter(id => items.some(item => item.id === id));

  const applyFilters = (next: CorpusFilterValues, cassetteId = cassette) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    if (cassetteId) params.set('cassette', cassetteId);
    setSelected(new Set());
    setSearch(params, rewrite);
  };

  const loadMore = async () => {
    const last = items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    const result = await callApi(() => api.recordings.$get({ query: queryFor(search, last.id) }));
    setLoadingMore(false);
    setMore({ source: page, items: [...extra.items, ...(result.data?.items ?? [])], error: result.error?.message ?? null });
  };

  const deleteSelected = async () => {
    const ids = shownSelection;
    const result = await callApi(() => api.recordings.delete.$post({ json: { ids } }));
    if (result.error) {
      setDeleteError(result.error.message);
      return;
    }
    setSelected(new Set());
    toasts.succeed(t('corpus.delete.done', { count: result.data.deleted }));
    await revalidator.revalidate();
  };

  return <section className="dashboard-page">
    <DashboardPageHeader
      actions={<ResourceListActions onRefresh={() => void revalidator.revalidate()} refreshLabel={t('corpus.refresh')} refreshing={revalidator.state === 'loading'} />}
      description={t('corpus.description')}
      title={t('nav.corpus')}
    />

    <CorpusFilters onChange={applyFilters} values={filters} />
    {cassette && <div className="flex items-center gap-2">
      <Text>{t('corpus.filters.cassette', { id: cassette })}</Text>
      <Button appearance="subtle" onClick={() => applyFilters(filters, null)} size="small">{t('corpus.filters.clearCassette')}</Button>
    </div>}

    {error && <OutcomeMessageBar title={t('corpus.loadFailed')}>{error}</OutcomeMessageBar>}
    {deleteError && <OutcomeMessageBar onDismiss={() => setDeleteError(null)} title={t('corpus.delete.failed')}>{deleteError}</OutcomeMessageBar>}

    {page !== null && (items.length === 0
      ? <Panel><EmptyState description={t('corpus.empty.description')} title={t('corpus.empty.title')} /></Panel>
      : <>
          <div className="flex flex-wrap items-center gap-3">
            <Text className="text-fui-fg2">{t('corpus.count', { shown: items.length, total: page.total })}</Text>
            {shownSelection.length > 0 && <Button onClick={() => setConfirming(true)}>{t('corpus.delete.selected', { count: shownSelection.length })}</Button>}
          </div>
          <ResourceListPanel>
            <RecordingList items={items} onSelectionChange={setSelected} selected={selected} />
          </ResourceListPanel>
          {extra.error && <OutcomeMessageBar title={t('corpus.loadFailed')}>{extra.error}</OutcomeMessageBar>}
          {items.length < page.total && <div><Button disabledFocusable={loadingMore} onClick={() => void loadMore()}>{t('corpus.loadMore')}</Button></div>}
        </>)}

    <ConfirmDialog
      actionLabel={t('corpus.delete.action')}
      message={t('corpus.delete.message', { count: shownSelection.length })}
      onConfirm={() => { setConfirming(false); void deleteSelected(); }}
      onOpenChange={setConfirming}
      open={confirming}
      title={t('corpus.delete.title', { count: shownSelection.length })}
    />
  </section>;
}
