import type { ReactNode } from 'react';
import { type ClientLoaderFunctionArgs, data, useLoaderData } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import { statusTone } from '../components/requests/list.tsx';
import { ProvenanceTable } from '../components/requests/provenance.tsx';
import { replayCurl } from '../components/requests/replay-snippet.ts';
import { TimingCompare } from '../components/requests/timing-compare.tsx';
import { TraceView } from '../components/requests/trace-view.tsx';
import { selectionText } from '../components/scenarios/preview-panel.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { formatDuration } from '../lib/format-duration.ts';
import { dateTime } from '../lib/format-time.ts';
import { NO_READING } from '../lib/no-reading.ts';
import { outcomeTone } from '../lib/outcome.ts';
import { useLocale } from '../lib/use-locale.ts';
import { BackNavigationButton } from '@flowmock/ui/controls/back-navigation-button.tsx';
import { CodeBlock } from '@flowmock/ui/controls/code-block.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { PANEL_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { useCopyToClipboard } from '@flowmock/ui/controls/use-copy-to-clipboard.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Text } = fluentComponents;

export async function clientLoader({ params }: Pick<ClientLoaderFunctionArgs, 'params'>) {
  await requireAccess();
  const result = await callApi(() => api.requests[':id'].$get({ param: { id: params.id! } }));
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

const FACTS_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-4';

export default function RequestDetailPage() {
  const entry = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const locale = useLocale();
  const trace = entry.trace;
  const curl = replayCurl(window.location.origin, entry);
  const copy = useCopyToClipboard();

  return <section className="dashboard-page">
    <div><BackNavigationButton to="/requests">{t('nav.requests')}</BackNavigationButton></div>
    <DashboardPageHeader description={`${entry.method} ${entry.path} · ${dateTime(entry.startedAt, locale)}`} title={entry.model ?? entry.protocol} />
    {entry.error && <OutcomeMessageBar title={t('requests.detail.error')}>{entry.error}</OutcomeMessageBar>}

    <Panel>
      <div className={FACTS_CLASS}>
        <Fact label={t('requests.list.mode')}><Text>{t(`requests.mode.${entry.mode}`)}</Text></Fact>
        <Fact label={t('requests.list.key')}><Text>{entry.keyName}</Text></Fact>
        <Fact label={t('requests.detail.protocol')}><Text>{`${entry.protocol} · ${entry.transport}`}</Text></Fact>
        <Fact label={t('requests.list.status')}>{entry.status === null ? <Text>{NO_READING}</Text> : <StatusBadge tone={statusTone(entry.status)}>{entry.status}</StatusBadge>}</Fact>
        <Fact label={t('requests.list.outcome')}>{entry.outcome === null ? <Text>{NO_READING}</Text> : <StatusBadge tone={outcomeTone(entry.outcome)}>{entry.outcome}</StatusBadge>}</Fact>
        <Fact label={t('requests.detail.duration')}><Text>{formatDuration(entry.durationMs)}</Text></Fact>
        <Fact label={t('requests.detail.recording')}>{entry.recordingId === null
          ? <Text>{NO_READING}</Text>
          : <span className="font-mono"><RouteLink to={`/corpus/${entry.recordingId}`}>{entry.recordingId}</RouteLink></span>}</Fact>
        {entry.cassetteId !== null && <Fact label={t('requests.detail.cassette')}><RouteLink to={`/cassettes/${entry.cassetteId}`}>{entry.cassetteId}</RouteLink></Fact>}
      </div>
    </Panel>

    {trace && <div className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('requests.detail.replayDescription')} level={2} title={t('requests.detail.replay')} />
      <Panel>
        <div className="grid gap-4">
          {trace.error && <OutcomeMessageBar title={t('scenarios.preview.replayError', { code: trace.error.code })}>{trace.error.message}</OutcomeMessageBar>}
          <div className={FACTS_CLASS}>
            <Fact label={t('requests.detail.scenario')}><RouteLink to={`/scenarios/${encodeURIComponent(trace.scenario)}`}>{trace.scenario}</RouteLink></Fact>
            <Fact label={t('scenarios.preview.selectionLabel')}><Text>{selectionText(trace.selection, t)}</Text></Fact>
            <Fact label={t('scenarios.preview.fault')}><Text>{trace.fault === null
              ? t('scenarios.preview.noFault')
              : t('scenarios.preview.faultRule', { index: trace.fault.rule + 1, type: t(`scenarios.form.faults.types.${trace.fault.type}`) })}</Text></Fact>
            <Fact label={t('scenarios.preview.seed')}><Text className="font-mono">{trace.seed}</Text></Fact>
            <Fact label={t('scenarios.preview.session')}><Text className="font-mono">{trace.sessionId}</Text></Fact>
            <Fact label={t('requests.detail.callIndex')}><Text>{trace.callIndex}</Text></Fact>
          </div>
          {trace.misses.length > 0 && <div className="grid gap-1">
            <Text weight="semibold">{t('scenarios.preview.misses')}</Text>
            <ul className="m-0 pl-5">{trace.misses.map(miss => <li key={miss}><Text>{miss}</Text></li>)}</ul>
          </div>}
          {trace.frames.length > 0 && <TraceView entry={{ ...entry, trace }} />}
        </div>
      </Panel>
    </div>}

    {entry.expected && entry.result && <div className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('requests.timing.description')} level={2} title={t('requests.timing.title')} />
      <Panel padding="flush"><TimingCompare expected={entry.expected} result={entry.result} /></Panel>
    </div>}

    {trace && trace.provenance.length > 0 && <div className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('requests.provenance.description')} level={2} title={t('requests.provenance.title')} />
      <Panel padding="flush"><ProvenanceTable entries={trace.provenance} /></Panel>
    </div>}

    {trace && curl && <div className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('requests.replaySnippet.description', { callIndex: trace.callIndex })} level={2} title={t('requests.replaySnippet.title')} />
      <CodeBlock code={curl} copyOutcome={copy.outcomeFor('curl')} language="bash" onCopy={() => copy.copy(curl, 'curl')} />
    </div>}
  </section>;
}
