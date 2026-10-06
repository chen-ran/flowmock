import { useCallback, useMemo, useState } from 'react';
import { type ClientLoaderFunctionArgs, useLoaderData, useRevalidator, useSearchParams } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import { RequestFilters } from '../components/requests/filters.tsx';
import { RequestList } from '../components/requests/list.tsx';
import { matchesFilters, type RequestFilterValues, type RequestSummary, summaryOf } from '../components/requests/summary.ts';
import { useTranslation } from '../i18n/translation.ts';
import { type StreamStatus, useServerEvents } from '../lib/use-server-events.ts';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { EmptyState } from '@flowmock/ui/controls/empty-state.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { ResourceListActions, ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';
import { useEntryRewrite } from '@flowmock/ui/page-navigation';

const { Button } = fluentComponents;

const PAGE_SIZE = 100;
// The newest requests the stream adds above a page, beyond which the oldest
// streamed ones are dropped rather than the page growing without end.
const MAX_STREAMED = 500;

const filtersFrom = (search: URLSearchParams): RequestFilterValues => ({
  mode: search.get('mode') ?? '',
  key: search.get('key') ?? '',
  protocol: search.get('protocol') ?? '',
  status: search.get('status') ?? '',
  outcome: search.get('outcome') ?? '',
});

const queryFor = (search: URLSearchParams, before?: string) => {
  const filters = filtersFrom(search);
  return {
    limit: String(PAGE_SIZE),
    ...(filters.mode && { mode: filters.mode as 'record' | 'replay' }),
    ...(filters.key && { key: filters.key }),
    ...(filters.protocol && { protocol: filters.protocol as never }),
    ...(filters.status && { status: filters.status as '2xx' }),
    ...(filters.outcome && { outcome: filters.outcome }),
    ...(before && { before }),
  };
};

export async function clientLoader({ request }: Pick<ClientLoaderFunctionArgs, 'request'>) {
  await requireAccess();
  const search = new URL(request.url).searchParams;
  const [page, keys] = await Promise.all([
    callApi(() => api.requests.$get({ query: queryFor(search) })),
    callApi(() => api.keys.$get()),
  ]);
  return {
    items: page.data?.items.map(summaryOf) ?? null,
    keys: [...new Set(keys.data?.items.map(key => key.name) ?? [])].sort(),
    error: page.error?.message ?? null,
  };
}

const STATUS_TONES = { connecting: 'neutral', live: 'success', reconnecting: 'warning', paused: 'neutral' } as const satisfies Record<StreamStatus, string>;

export default function Requests() {
  const { error, items, keys } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const rewrite = useEntryRewrite();
  const revalidator = useRevalidator();
  const filters = useMemo(() => filtersFrom(search), [search]);
  const [paused, setPaused] = useState(false);
  // Requests streamed in above the page, and older pages below it, each tied
  // to the loader result they extend so a new filter starts afresh.
  const [streamed, setStreamed] = useState<{ source: typeof items; items: RequestSummary[] }>({ source: items, items: [] });
  const [older, setOlder] = useState<{ source: typeof items; items: RequestSummary[]; error: string | null; exhausted: boolean }>({ source: items, items: [], error: null, exhausted: false });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const above = streamed.source === items ? streamed.items : [];
  const below = older.source === items ? older : { source: items, items: [], error: null, exhausted: false };

  const onEvent = useCallback((data: string) => {
    const item = JSON.parse(data) as RequestSummary;
    if (!matchesFilters(item, filters)) return;
    setStreamed(previous => {
      const current = previous.source === items ? previous.items : [];
      if (current.some(existing => existing.id === item.id) || items?.some(existing => existing.id === item.id)) return previous;
      return { source: items, items: [item, ...current].slice(0, MAX_STREAMED) };
    });
  }, [filters, items]);
  const status = useServerEvents({ enabled: !paused && items !== null, event: 'request', onEvent, path: '/api/requests/stream' });

  // The stream sends a request when it ends, so a long one arrives after
  // shorter ones it started before; the list keeps the server's order, newest
  // start first.
  const shown = items === null ? [] : [...above, ...items, ...below.items]
    .sort((left, right) => right.startedAt - left.startedAt || right.id.localeCompare(left.id));

  const loadOlder = async () => {
    const last = shown.at(-1);
    if (!last) return;
    setLoadingOlder(true);
    const result = await callApi(() => api.requests.$get({ query: queryFor(search, last.id) }));
    setLoadingOlder(false);
    const page = result.data?.items.map(summaryOf) ?? [];
    setOlder({ source: items, items: [...below.items, ...page], error: result.error?.message ?? null, exhausted: result.data !== undefined && page.length < PAGE_SIZE });
  };

  // Resuming reloads the page, so what arrived while paused is not missed.
  const togglePause = () => {
    if (paused) void revalidator.revalidate();
    setPaused(!paused);
  };

  return <section className="dashboard-page">
    <DashboardPageHeader
      actions={<div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STATUS_TONES[status]}>{t(`monitor.status.${status}`)}</StatusBadge>
        <Button onClick={togglePause}>{paused ? t('requests.resume') : t('requests.pause')}</Button>
        <ResourceListActions onRefresh={() => void revalidator.revalidate()} refreshLabel={t('requests.refresh')} refreshing={revalidator.state === 'loading'} />
      </div>}
      description={t('requests.description')}
      title={t('nav.requests')}
    />
    <RequestFilters keys={keys} onChange={next => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
      setSearch(params, rewrite);
    }} values={filters} />
    {error && <OutcomeMessageBar title={t('requests.loadFailed')}>{error}</OutcomeMessageBar>}
    {items !== null && (shown.length === 0
      ? <Panel><EmptyState description={t('requests.empty.description')} title={t('requests.empty.title')} /></Panel>
      : <>
          <ResourceListPanel><RequestList items={shown} /></ResourceListPanel>
          {below.error && <OutcomeMessageBar title={t('requests.loadFailed')}>{below.error}</OutcomeMessageBar>}
          {!below.exhausted && items.length + below.items.length >= PAGE_SIZE && <div>
            <Button disabledFocusable={loadingOlder} onClick={() => void loadOlder()}>{t('requests.loadOlder')}</Button>
          </div>}
        </>)}
  </section>;
}
