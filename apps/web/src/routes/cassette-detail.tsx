import { useState } from 'react';
import type { ReactNode } from 'react';
import { data, useLoaderData, useNavigate, useRevalidator } from 'react-router';

import type { Route } from './+types/cassette-detail';
import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import { CassetteSequence, sequenceScenarioYaml } from '../components/cassettes/sequence.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { downloadWithSession } from '../lib/download.ts';
import { dateTime } from '../lib/format-time.ts';
import { NO_READING } from '../lib/no-reading.ts';
import { useLocale } from '../lib/use-locale.ts';
import { BackNavigationButton } from '@flowmock/ui/controls/back-navigation-button.tsx';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { DialogShell } from '@flowmock/ui/controls/dialog-shell.tsx';
import { EmptyState } from '@flowmock/ui/controls/empty-state.tsx';
import { Checkbox, Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { PANEL_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { useOutcomeToasts } from '@flowmock/ui/controls/outcome-toast.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, DialogActions, DialogTitle, Field, Text } = fluentComponents;

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  await requireAccess();
  const result = await callApi(() => api.cassettes[':id'].$get({ param: { id: params.id } }));
  if (result.error?.status === 404) throw data(null, { status: 404, statusText: 'Not Found' });
  if (result.error) throw new Error(result.error.message, { cause: result.error });
  return result.data;
}

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return <div className="grid gap-1 min-w-0">
    <Text className="text-fui-fg2" size={200}>{label}</Text>
    <div className="min-w-0 break-words">{children}</div>
  </div>;
}

export default function CassetteDetailPage() {
  const cassette = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const toasts = useOutcomeToasts();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(cassette.name);
  const [deleting, setDeleting] = useState(false);
  const [withRecordings, setWithRecordings] = useState(false);
  const open = cassette.closedAt === null;

  const patch = async (body: { name?: string; closed?: boolean }, done: string) => {
    const result = await callApi(() => api.cassettes[':id'].$patch({ param: { id: cassette.id }, json: body }));
    if (result.error) {
      setError(result.error.message);
      return false;
    }
    toasts.succeed(done);
    await revalidator.revalidate();
    return true;
  };

  const exportCassette = async () => {
    const result = await downloadWithSession(`/api/export?cassette=${encodeURIComponent(cassette.id)}`, `${cassette.id}.ndjson`);
    if (result.error) setError(result.error);
  };

  const remove = async () => {
    const result = await callApi(() => api.cassettes[':id'].$delete({ param: { id: cassette.id }, query: { recordings: withRecordings ? 'true' : 'false' } }));
    if (result.error) {
      setError(result.error.message);
      return;
    }
    toasts.succeed(t('cassettes.delete.done'));
    await navigate('/cassettes');
  };

  return <section className="dashboard-page">
    <div><BackNavigationButton to="/cassettes">{t('nav.cassettes')}</BackNavigationButton></div>
    <DashboardPageHeader
      actions={<div className="flex flex-wrap gap-2">
        <Button appearance="primary" onClick={() => void navigate(`/scenarios/new?draft=${encodeURIComponent(sequenceScenarioYaml(cassette))}`)}>{t('cassettes.actions.sequenceScenario')}</Button>
        <Button onClick={() => void exportCassette()}>{t('cassettes.actions.export')}</Button>
        <Button onClick={() => { setName(cassette.name); setRenaming(true); }}>{t('cassettes.actions.rename')}</Button>
        {open && <Button onClick={() => void patch({ closed: true }, t('cassettes.close.done'))}>{t('cassettes.actions.close')}</Button>}
        <Button onClick={() => { setWithRecordings(false); setDeleting(true); }}>{t('cassettes.actions.delete')}</Button>
      </div>}
      description={cassette.description ?? cassette.id}
      title={cassette.name}
    />
    {error && <OutcomeMessageBar onDismiss={() => setError(null)} title={t('cassettes.actionFailed')}>{error}</OutcomeMessageBar>}

    <Panel>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-4">
        <Fact label={t('cassettes.list.state')}>{open
          ? <StatusBadge tone="accent">{t('cassettes.state.open')}</StatusBadge>
          : <StatusBadge tone="neutral">{t('cassettes.state.closed')}</StatusBadge>}</Fact>
        <Fact label={t('cassettes.list.recordings')}><Text>{cassette.recordings.length}</Text></Fact>
        <Fact label={t('cassettes.list.key')}><Text>{cassette.keyName ?? NO_READING}</Text></Fact>
        <Fact label={t('cassettes.list.target')}><Text>{cassette.targetId ?? NO_READING}</Text></Fact>
        <Fact label={t('cassettes.list.session')}><Text className="font-mono">{cassette.sessionId ?? NO_READING}</Text></Fact>
        <Fact label={t('cassettes.list.created')}><Text>{dateTime(cassette.createdAt, locale)}</Text></Fact>
        <Fact label={t('cassettes.detail.closedAt')}><Text>{dateTime(cassette.closedAt, locale)}</Text></Fact>
      </div>
    </Panel>

    <div className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('cassettes.detail.sequenceDescription')} level={2} title={t('cassettes.detail.sequence')} />
      {cassette.recordings.length === 0
        ? <Panel><EmptyState title={t('cassettes.detail.noRecordings')} /></Panel>
        : <ResourceListPanel><CassetteSequence recordings={cassette.recordings} /></ResourceListPanel>}
    </div>

    <DialogShell
      actions={<DialogActions>
        <Button onClick={() => setRenaming(false)}>{t('cassettes.rename.cancel')}</Button>
        <Button appearance="primary" disabled={!name.trim()} type="submit">{t('cassettes.rename.save')}</Button>
      </DialogActions>}
      onOpenChange={(_, state) => setRenaming(state.open)}
      onSubmit={() => void patch({ name: name.trim() }, t('cassettes.rename.done')).then(ok => { if (ok) setRenaming(false); })}
      open={renaming}
      title={<DialogTitle>{t('cassettes.rename.title')}</DialogTitle>}
    >
      <Field label={t('cassettes.list.name')}><Input onChange={(_, value) => setName(value.value)} value={name} /></Field>
    </DialogShell>

    <ConfirmDialog
      actionLabel={t('cassettes.actions.delete')}
      message={t('cassettes.delete.message')}
      onConfirm={() => { setDeleting(false); void remove(); }}
      onOpenChange={setDeleting}
      open={deleting}
      title={t('cassettes.delete.title')}
    >
      {cassette.recordings.length > 0 && <Checkbox
        checked={withRecordings}
        label={t('cassettes.delete.withRecordings', { count: cassette.recordings.length })}
        onChange={(_, value) => setWithRecordings(value.checked === true)}
      />}
    </ConfirmDialog>
  </section>;
}
