// The leave guard is adapted from Floway apps/web/src/components/upstream-editor/page.tsx (MIT). See NOTICE.md.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { type BlockerFunction, type ClientLoaderFunctionArgs, data, useBlocker, useLoaderData, useNavigate } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import type { CassetteSummary, RecordingSummary, ScenarioDetail } from '../api/types.ts';
import { FaultsSection } from '../components/scenarios/form/faults.tsx';
import { applyForm, type ScenarioForm, scenarioToForm } from '../components/scenarios/form/model.ts';
import { NetworkSection } from '../components/scenarios/form/network.tsx';
import { SelectionSection } from '../components/scenarios/form/selection.tsx';
import { TimingSection } from '../components/scenarios/form/timing.tsx';
import { problemMarkers, problemsOf, type ScenarioProblems } from '../components/scenarios/markers.ts';
import { PreviewPanel } from '../components/scenarios/preview-panel.tsx';
import { ScenarioYamlEditor } from '../components/scenarios/yaml-editor.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { BackNavigationButton } from '@flowmock/ui/controls/back-navigation-button.tsx';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { PANEL_STACK_CLASS, TWO_COLUMN_FORM_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { useOutcomeToasts } from '@flowmock/ui/controls/outcome-toast.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { useDialogInvocation } from '@flowmock/ui/controls/use-dialog-invocation.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, Divider, Field, MessageBar, MessageBarBody, Tab, TabList, Text } = fluentComponents;

// What a new scenario starts from when no draft is handed over: the server's
// defaults, spelled out where the form edits them.
const NEW_SCENARIO = `name: my-scenario
description: Recorded timing over a slow link
selection: { mode: match-then-sample }
timing: { mode: recorded, scale: 1 }
network:
  latencyMs: 80
`;

// The create page lives at /scenarios/new, so a scenario of that name could
// never be opened at its own address.
const RESERVED_NAME = 'new';

export interface ScenarioEditorData {
  scenario: ScenarioDetail | null;
  source: string;
  recordings: RecordingSummary[];
  cassettes: CassetteSummary[];
}

// Shared by the edit route and the create route, which takes a draft -- a
// cassette's sequence scenario, say -- in ?draft=.
export const loadScenarioEditor = async (name: string | null, request: Request): Promise<ScenarioEditorData> => {
  await requireAccess();
  const [scenario, recordings, cassettes] = await Promise.all([
    name === null ? null : callApi(() => api.scenarios[':name'].$get({ param: { name } })),
    callApi(() => api.recordings.$get({ query: { limit: '50' } })),
    callApi(() => api.cassettes.$get()),
  ]);
  if (scenario?.error?.status === 404) throw data(null, { status: 404, statusText: 'Not Found' });
  if (scenario?.error) throw new Error(scenario.error.message, { cause: scenario.error });
  return {
    scenario: scenario?.data ?? null,
    source: scenario?.data.source ?? new URL(request.url).searchParams.get('draft') ?? NEW_SCENARIO,
    recordings: recordings.data?.items ?? [],
    cassettes: cassettes.data?.items ?? [],
  };
};

export async function clientLoader({ params, request }: Pick<ClientLoaderFunctionArgs, 'params' | 'request'>) {
  return await loadScenarioEditor(params.name ?? null, request);
}

function FormSection({ children, description, title }: { children: ReactNode; description?: string; title: string }) {
  return <section className="grid gap-3 min-w-0">
    <SectionHeader description={description} level={3} title={title} />
    {children}
  </section>;
}

type View = 'form' | 'yaml';

function ScenarioEditor({ loaded }: { loaded: ScenarioEditorData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toasts = useOutcomeToasts();
  const creating = loaded.scenario === null;
  const [baseline, setBaseline] = useState(creating ? null : loaded.source);
  const [source, setSource] = useState(loaded.source);
  const [view, setView] = useState<View>('form');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  // Problems belong to the text the server read; an edit makes them stale.
  const [problems, setProblems] = useState<{ source: string; problems: ScenarioProblems } | null>(null);
  const parsed = useMemo(() => scenarioToForm(source), [source]);
  const dirty = source !== baseline;
  const name = creating ? parsed.form?.name : loaded.scenario?.name;
  const currentProblems = problems?.source === source ? problems.problems : null;
  const markers = useMemo(() => (currentProblems ? problemMarkers(source, currentProblems) : []), [currentProblems, source]);

  const reportProblems = useCallback((next: ScenarioProblems | null) => {
    setProblems(next === null ? null : { source, problems: next });
  }, [source]);

  const changeForm = (next: ScenarioForm) => setSource(applyForm(source, next));

  const save = async () => {
    if (!name) {
      reportProblems({ message: t('scenarios.editor.nameRequired'), issues: [{ path: ['name'], message: t('scenarios.editor.nameRequired') }], position: null });
      return;
    }
    if (creating && name === RESERVED_NAME) {
      reportProblems({ message: t('scenarios.editor.nameReserved', { name }), issues: [{ path: ['name'], message: t('scenarios.editor.nameReserved', { name }) }], position: null });
      return;
    }
    setSaving(true);
    if (creating) {
      const existing = await callApi(() => api.scenarios[':name'].$get({ param: { name } }));
      if (existing.data) {
        setSaving(false);
        reportProblems({ message: t('scenarios.editor.nameTaken', { name }), issues: [{ path: ['name'], message: t('scenarios.editor.nameTaken', { name }) }], position: null });
        return;
      }
    }
    const result = await callApi(() => api.scenarios[':name'].$put({ param: { name } }, { init: { body: source, headers: { 'content-type': 'application/yaml' } } }));
    setSaving(false);
    if (result.error) {
      reportProblems(problemsOf(result.error.message, result.error.raw));
      return;
    }
    setProblems(null);
    setBaseline(source);
    toasts.succeed(t('scenarios.editor.saved'));
    if (creating) setSaved(name);
  };

  // A path change leaves the scenario; anything else is this page.
  const blocker = useBlocker(useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && dirty,
    [dirty],
  ));

  // Declared after the blocker so that, within the commit a save produces,
  // the blocker is re-registered against the now-clean source before this runs.
  useEffect(() => {
    if (saved !== null) void navigate(`/scenarios/${encodeURIComponent(saved)}`, { replace: true });
  }, [navigate, saved]);

  // Releasing the blocker commits the route change, which would unmount the
  // dialog mid-exit, so confirming only closes it and the blocker is released
  // from the exit; a dismissal resets the blocker before that.
  const leaveDialog = useDialogInvocation<void>();
  const blocked = blocker.state === 'blocked';
  const [dialogFollowsBlocked, setDialogFollowsBlocked] = useState(blocked);
  if (dialogFollowsBlocked !== blocked) {
    setDialogFollowsBlocked(blocked);
    if (blocked) leaveDialog.open(); else leaveDialog.close();
  }

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const form = parsed.form;
  return <section className="dashboard-page">
    <div><BackNavigationButton to="/scenarios">{t('nav.scenarios')}</BackNavigationButton></div>
    <DashboardPageHeader
      actions={<div className="flex flex-wrap gap-2">
        {!creating && <Button disabled={!dirty || saving} onClick={() => { setSource(baseline ?? source); setProblems(null); }}>{t('scenarios.editor.revert')}</Button>}
        <Button appearance="primary" disabledFocusable={saving || (!creating && !dirty)} onClick={() => void save()}>{t('scenarios.editor.save')}</Button>
      </div>}
      description={creating ? t('scenarios.editor.createDescription') : loaded.scenario?.builtIn ? t('scenarios.editor.builtInDescription') : t('scenarios.editor.editDescription')}
      title={creating ? t('scenarios.editor.createTitle') : loaded.scenario!.name}
    />
    {currentProblems && <OutcomeMessageBar onDismiss={() => setProblems(null)} title={t('scenarios.editor.invalid')}>
      {currentProblems.issues.length > 0
        ? <ul className="m-0 pl-5">{currentProblems.issues.map((issue, index) => <li key={index}>
            {issue.path.length > 0 && <code>{issue.path.join('.')}</code>}{issue.path.length > 0 && ': '}{issue.message}
          </li>)}</ul>
        : currentProblems.message}
    </OutcomeMessageBar>}

    <Panel padding="flush">
      <div className="px-[var(--flowmock-panel-inset)] pt-2">
        <TabList aria-label={t('scenarios.editor.views')} onTabSelect={(_, value) => setView(value.value as View)} selectedValue={view}>
          <Tab value="form">{t('scenarios.editor.form')}</Tab>
          <Tab value="yaml">{t('scenarios.editor.yaml')}</Tab>
        </TabList>
      </div>
      <Divider />
      {view === 'yaml'
        ? <div className="h-[560px] min-h-0"><ScenarioYamlEditor markers={markers} onChange={setSource} value={source} /></div>
        : form === null
          ? <div className="p-[var(--flowmock-panel-inset)]">
              <MessageBar intent="warning"><MessageBarBody>{t('scenarios.editor.unparsable', { error: parsed.error ?? '' })}</MessageBarBody></MessageBar>
            </div>
          : <div className="grid gap-5 p-[var(--flowmock-panel-inset)]">
              <FormSection title={t('scenarios.form.general')}>
                <div className={`${TWO_COLUMN_FORM_CLASS} gap-3`}>
                  <Field hint={creating ? t('scenarios.form.nameHint') : t('scenarios.form.nameFixed')} label={t('scenarios.form.name')}>
                    <Input onChange={(_, value) => changeForm({ ...form, name: value.value === '' ? undefined : value.value })} readOnly={!creating} value={form.name ?? ''} />
                  </Field>
                  <Field label={t('scenarios.form.description')}>
                    <Input onChange={(_, value) => changeForm({ ...form, description: value.value === '' ? undefined : value.value })} value={form.description ?? ''} />
                  </Field>
                </div>
              </FormSection>
              <Divider />
              <FormSection description={t('scenarios.form.selection.description')} title={t('scenarios.form.selection.title')}>
                <SelectionSection cassettes={loaded.cassettes} onChange={selection => changeForm({ ...form, selection })} value={form.selection} />
              </FormSection>
              <Divider />
              <FormSection description={t('scenarios.form.timing.description')} title={t('scenarios.form.timing.title')}>
                <TimingSection onChange={timing => changeForm({ ...form, timing })} value={form.timing} />
              </FormSection>
              <Divider />
              <FormSection description={t('scenarios.form.network.description')} title={t('scenarios.form.network.title')}>
                <NetworkSection onChange={network => changeForm({ ...form, network })} value={form.network} />
              </FormSection>
              <Divider />
              <FormSection description={t('scenarios.form.faults.description')} title={t('scenarios.form.faults.title')}>
                <FaultsSection onChange={faults => changeForm({ ...form, faults })} value={form.faults} />
              </FormSection>
              <Text className="text-fui-fg2" size={200}>{t('scenarios.form.yamlOnly')}</Text>
            </div>}
    </Panel>

    <div className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('scenarios.preview.description')} level={2} title={t('scenarios.preview.title')} />
      <Panel><PreviewPanel name={name ?? ''} onProblems={reportProblems} recordings={loaded.recordings} source={source} /></Panel>
    </div>

    {leaveDialog.invocation && <ConfirmDialog
      actionLabel={t('scenarios.leave.leave')}
      cancelLabel={t('scenarios.leave.stay')}
      key={leaveDialog.invocation.key}
      message={t('scenarios.leave.message')}
      onCancel={() => blocker.state === 'blocked' && blocker.reset()}
      onConfirm={() => leaveDialog.close()}
      onExited={() => { if (blocker.state === 'blocked') blocker.proceed(); }}
      onOpenChange={open => { if (!open && blocker.state === 'blocked') blocker.reset(); }}
      open={leaveDialog.isOpen}
      title={t('scenarios.leave.title')}
    />}
  </section>;
}

export default function ScenarioEditorPage() {
  const loaded = useLoaderData<typeof clientLoader>();
  // A move from one scenario to another starts the editor afresh.
  return <ScenarioEditor key={loaded.scenario?.name ?? ''} loaded={loaded} />;
}
