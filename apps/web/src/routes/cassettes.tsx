import { useLoaderData, useRevalidator } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import { CassetteList } from '../components/cassettes/list.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { EmptyState } from '@flowmock/ui/controls/empty-state.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { ResourceListActions, ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';

export async function clientLoader() {
  await requireAccess();
  const result = await callApi(() => api.cassettes.$get());
  return { items: result.data?.items ?? null, error: result.error?.message ?? null };
}

export default function Cassettes() {
  const { error, items } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const revalidator = useRevalidator();

  return <section className="dashboard-page">
    <DashboardPageHeader
      actions={<ResourceListActions onRefresh={() => void revalidator.revalidate()} refreshLabel={t('cassettes.refresh')} refreshing={revalidator.state === 'loading'} />}
      description={t('cassettes.description')}
      title={t('nav.cassettes')}
    />
    {error && <OutcomeMessageBar title={t('cassettes.loadFailed')}>{error}</OutcomeMessageBar>}
    {items !== null && (items.length === 0
      ? <Panel><EmptyState description={t('cassettes.empty.description')} title={t('cassettes.empty.title')} /></Panel>
      : <ResourceListPanel><CassetteList items={items} /></ResourceListPanel>)}
  </section>;
}
