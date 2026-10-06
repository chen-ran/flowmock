import { type ReactNode, useState } from 'react';

import { problemsOf, type ScenarioProblems } from './markers.ts';
import { PlanTimeline } from './plan-timeline.tsx';
import { defaultPastedRequest, type SampleRequest, SampleRequestPicker } from './sample-request-picker.tsx';
import { api, callApi } from '../../api/client.ts';
import type { PreviewTrace, RecordingSummary, ScenarioPreview } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatTokenRate } from '../../lib/format-number.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { ProvenanceTable } from '../requests/provenance.tsx';
import { Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, Field, MessageBar, MessageBarBody, MessageBarTitle, SpinButton, Text } = fluentComponents;

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return <div className="grid gap-1 min-w-0">
    <Text className="text-fui-fg2" size={200}>{label}</Text>
    <div className="min-w-0 break-words">{children}</div>
  </div>;
}

type Translate = ReturnType<typeof useTranslation>['t'];

export const selectionText = (selection: PreviewTrace['selection'], t: Translate): string => {
  if (selection === null) return NO_READING;
  switch (selection.mode) {
  case 'exact': return t('scenarios.preview.selection.exact', { count: selection.candidates });
  case 'prefix': return t('scenarios.preview.selection.prefix', { shared: selection.prefixLength, length: selection.requestLength, count: selection.candidates });
  case 'sequence': return t('scenarios.preview.selection.sequence', { cassette: selection.cassetteId, seq: selection.seq });
  case 'sample': return t('scenarios.preview.selection.sample', { count: selection.candidates, score: selection.score.toFixed(2) });
  case 'pinned': return t('scenarios.preview.selection.pinned');
  }
};

function PreviewResult({ result }: { result: ScenarioPreview }) {
  const { t } = useTranslation();
  const { plan, trace } = result;
  return <div className="grid gap-4">
    {trace.error && <MessageBar intent="warning">
      <MessageBarBody>
        <MessageBarTitle>{t('scenarios.preview.replayError', { code: trace.error.code })}</MessageBarTitle>
        {trace.error.message}
      </MessageBarBody>
    </MessageBar>}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-6 gap-y-4">
      <Fact label={t('scenarios.preview.status')}><StatusBadge tone={plan.status >= 400 ? 'danger' : 'success'}>{plan.status}</StatusBadge></Fact>
      <Fact label={t('scenarios.preview.recording')}>{trace.recordingId === null
        ? <Text>{NO_READING}</Text>
        : <span className="font-mono"><RouteLink to={`/corpus/${trace.recordingId}`}>{trace.recordingId}</RouteLink></span>}</Fact>
      <Fact label={t('scenarios.preview.selectionLabel')}><Text>{selectionText(trace.selection, t)}</Text></Fact>
      <Fact label={t('scenarios.preview.fault')}><Text>{trace.fault === null
        ? t('scenarios.preview.noFault')
        : t('scenarios.preview.faultRule', { index: trace.fault.rule + 1, type: t(`scenarios.form.faults.types.${trace.fault.type}`) })}</Text></Fact>
      <Fact label={t('scenarios.preview.expectedTtft')}><Text>{formatDuration(plan.expected.ttftMs)}</Text></Fact>
      <Fact label={t('scenarios.preview.expectedTps')}><Text>{formatTokenRate(plan.expected.tps)}</Text></Fact>
      <Fact label={t('scenarios.preview.duration')}><Text>{formatDuration(plan.expected.durationMs)}</Text></Fact>
      <Fact label={t('scenarios.preview.outputTokens')}><Text>{plan.outputTokens}</Text></Fact>
      <Fact label={t('scenarios.preview.seed')}><Text className="font-mono">{trace.seed}</Text></Fact>
      <Fact label={t('scenarios.preview.session')}><Text className="font-mono">{trace.sessionId}</Text></Fact>
    </div>
    {trace.misses.length > 0 && <div className="grid gap-1">
      <Text weight="semibold">{t('scenarios.preview.misses')}</Text>
      <ul className="m-0 pl-5">{trace.misses.map(miss => <li key={miss}><Text>{miss}</Text></li>)}</ul>
    </div>}
    {plan.writes.length > 0 && <PlanTimeline plan={plan} trace={trace} />}
    {trace.provenance.length > 0 && <ProvenanceTable entries={trace.provenance} />}
  </div>;
}

// Plans a request against the scenario as it stands in the editor, saved or
// not, without sending anything upstream.
export function PreviewPanel({ name, onProblems, recordings, source }: {
  name: string;
  onProblems: (problems: ScenarioProblems | null) => void;
  recordings: readonly RecordingSummary[];
  source: string;
}) {
  const { t } = useTranslation();
  const [sample, setSample] = useState<SampleRequest | null>(() => (recordings.length > 0 ? null : defaultPastedRequest()));
  const [seed, setSeed] = useState('');
  const [session, setSession] = useState('');
  const [callIndex, setCallIndex] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScenarioPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!sample) return;
    setBusy(true);
    const response = await callApi(() => api.scenarios[':name'].preview.$post({
      param: { name: name || 'draft' },
      json: {
        source,
        protocol: sample.protocol,
        path: sample.path,
        body: sample.body,
        transport: sample.transport,
        callIndex,
        ...(seed.trim() !== '' && { seed: seed.trim() }),
        ...(session.trim() !== '' && { session: session.trim() }),
      },
    }));
    setBusy(false);
    if (response.error) {
      setError(response.error.message);
      setResult(null);
      onProblems(response.error.status === 400 ? problemsOf(response.error.message, response.error.raw) : null);
      return;
    }
    setError(null);
    setResult(response.data);
    onProblems(null);
  };

  return <div className="grid gap-4">
    <SampleRequestPicker onChange={setSample} recordings={recordings} />
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 items-start">
      <Field hint={t('scenarios.preview.callIndexHint')} label={t('scenarios.preview.callIndex')}>
        <SpinButton
          min={1}
          onChange={(_, data) => {
            const next = data.value ?? Number(data.displayValue);
            if (Number.isInteger(next) && next >= 1) setCallIndex(next);
          }}
          value={callIndex}
        />
      </Field>
      <Field hint={t('scenarios.preview.seedHint')} label={t('scenarios.preview.seed')}>
        <Input className="font-mono" onChange={(_, data) => setSeed(data.value)} value={seed} />
      </Field>
      <Field hint={t('scenarios.preview.sessionHint')} label={t('scenarios.preview.session')}>
        <Input className="font-mono" onChange={(_, data) => setSession(data.value)} value={session} />
      </Field>
    </div>
    <div>
      <Button appearance="primary" disabledFocusable={busy || sample === null} onClick={() => void run()}>{t('scenarios.preview.run')}</Button>
    </div>
    {error && <OutcomeMessageBar onDismiss={() => setError(null)} title={t('scenarios.preview.failed')}>{error}</OutcomeMessageBar>}
    {result && <PreviewResult result={result} />}
  </div>;
}
