import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi, callApiNoContent } from '../api/client.ts';
import type { KeyBinding, RecordingTarget } from '../api/types.ts';
import { ClientSnippets } from '../components/keys/client-snippets.tsx';
import { KeyDialog } from '../components/keys/key-dialog.tsx';
import { KeyList } from '../components/keys/key-list.tsx';
import { TargetDialog } from '../components/keys/target-dialog.tsx';
import { TargetList } from '../components/keys/target-list.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { DialogShell } from '@flowmock/ui/controls/dialog-shell.tsx';
import { EmptyState } from '@flowmock/ui/controls/empty-state.tsx';
import { SECTION_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { useOutcomeToasts } from '@flowmock/ui/controls/outcome-toast.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { ResourceListPanel } from '@flowmock/ui/controls/resource-list.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, DialogActions, DialogTitle } = fluentComponents;

export async function clientLoader() {
  await requireAccess();
  const [keys, targets, scenarios] = await Promise.all([
    callApi(() => api.keys.$get()),
    callApi(() => api.targets.$get()),
    callApi(() => api.scenarios.$get()),
  ]);
  return {
    keys: keys.data?.items ?? null,
    targets: targets.data?.items ?? null,
    scenarios: scenarios.data?.items ?? [],
    error: keys.error?.message ?? targets.error?.message ?? scenarios.error?.message ?? null,
  };
}

type Editing<T> = { item: T | null; serial: number } | null;

export default function Keys() {
  const { error, keys, scenarios, targets } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const toasts = useOutcomeToasts();
  // Each dialog mounts fresh per opening, so its fields start from the row
  // it was opened for.
  const [keyEditing, setKeyEditing] = useState<Editing<KeyBinding>>(null);
  const [targetEditing, setTargetEditing] = useState<Editing<RecordingTarget>>(null);
  const [snippetsFor, setSnippetsFor] = useState<KeyBinding | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'key'; item: KeyBinding } | { kind: 'target'; item: RecordingTarget } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [serial, setSerial] = useState(0);
  const open = <T,>(setter: (value: Editing<T>) => void, item: T | null) => { setSerial(value => value + 1); setter({ item, serial: serial + 1 }); };

  const remove = async () => {
    if (!deleting) return;
    const result = deleting.kind === 'key'
      ? await callApiNoContent(() => api.keys[':key'].$delete({ param: { key: deleting.item.key } }))
      : await callApiNoContent(() => api.targets[':id'].$delete({ param: { id: deleting.item.id } }));
    setDeleting(null);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    toasts.succeed(deleting.kind === 'key' ? t('keys.deleted') : t('keys.targets.deleted'));
    await revalidator.revalidate();
  };

  const saved = async (message: string) => {
    setKeyEditing(null);
    setTargetEditing(null);
    toasts.succeed(message);
    await revalidator.revalidate();
  };

  return <section className="dashboard-page">
    <DashboardPageHeader description={t('keys.description')} title={t('nav.keys')} />
    {error && <OutcomeMessageBar title={t('keys.loadFailed')}>{error}</OutcomeMessageBar>}
    {actionError && <OutcomeMessageBar onDismiss={() => setActionError(null)} title={t('keys.actionFailed')}>{actionError}</OutcomeMessageBar>}

    {keys !== null && <div className={SECTION_STACK_CLASS}>
      <SectionHeader actions={<Button appearance="primary" onClick={() => open(setKeyEditing, null)}>{t('keys.actions.create')}</Button>} description={t('keys.sectionDescription')} level={2} title={t('keys.title')} />
      {keys.length === 0
        ? <Panel><EmptyState description={t('keys.empty.description')} title={t('keys.empty.title')} /></Panel>
        : <ResourceListPanel><KeyList items={keys} onDelete={item => setDeleting({ kind: 'key', item })} onEdit={item => open(setKeyEditing, item)} onSnippets={setSnippetsFor} /></ResourceListPanel>}
    </div>}

    {targets !== null && <div className={SECTION_STACK_CLASS}>
      <SectionHeader actions={<Button onClick={() => open(setTargetEditing, null)}>{t('keys.targets.create')}</Button>} description={t('keys.targets.description')} level={2} title={t('keys.targets.title')} />
      {targets.length === 0
        ? <Panel><EmptyState description={t('keys.targets.empty.description')} title={t('keys.targets.empty.title')} /></Panel>
        : <ResourceListPanel><TargetList items={targets} onDelete={item => setDeleting({ kind: 'target', item })} onEdit={item => open(setTargetEditing, item)} /></ResourceListPanel>}
    </div>}

    {keyEditing && <KeyDialog
      binding={keyEditing.item}
      key={keyEditing.serial}
      onOpenChange={value => { if (!value) setKeyEditing(null); }}
      onSaved={() => void saved(t('keys.saved'))}
      open
      scenarios={scenarios}
      targets={targets ?? []}
    />}
    {targetEditing && <TargetDialog
      key={targetEditing.serial}
      onOpenChange={value => { if (!value) setTargetEditing(null); }}
      onSaved={() => void saved(t('keys.targets.saved'))}
      open
      target={targetEditing.item}
    />}
    <DialogShell
      actions={<DialogActions><Button onClick={() => setSnippetsFor(null)}>{t('keys.snippets.close')}</Button></DialogActions>}
      onOpenChange={(_, data) => { if (!data.open) setSnippetsFor(null); }}
      open={snippetsFor !== null}
      title={<DialogTitle>{t('keys.snippets.title', { name: snippetsFor?.name ?? '' })}</DialogTitle>}
      width="editor"
    >
      {snippetsFor && <ClientSnippets apiKey={snippetsFor.key} origin={window.location.origin} />}
    </DialogShell>
    <ConfirmDialog
      actionLabel={t('keys.actions.delete')}
      message={deleting?.kind === 'target' ? t('keys.targets.deleteMessage') : t('keys.deleteMessage')}
      onConfirm={() => void remove()}
      onOpenChange={value => { if (!value) setDeleting(null); }}
      open={deleting !== null}
      title={deleting?.kind === 'target' ? t('keys.targets.deleteTitle', { id: deleting.item.id }) : t('keys.deleteTitle', { name: deleting?.item.name ?? '' })}
    />
  </section>;
}
