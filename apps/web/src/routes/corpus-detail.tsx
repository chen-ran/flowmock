import { useState } from 'react';
import { data, useLoaderData, useNavigate } from 'react-router';

import type { Route } from './+types/corpus-detail';
import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import type { RecordingFrame } from '../api/types.ts';
import { ChunkTimeline } from '../components/corpus/chunk-timeline.tsx';
import { RecordingFacts } from '../components/corpus/detail-header.tsx';
import { FrameTimeline, type TimelineMark } from '../components/corpus/frame-timeline.tsx';
import { RequestView, ResponseView } from '../components/corpus/request-view.tsx';
import { TimelineAxis, TimelineLane } from '../components/corpus/timeline-axis.tsx';
import { TokenCurve } from '../components/corpus/token-curve.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { dateTime } from '../lib/format-time.ts';
import { useLocale } from '../lib/use-locale.ts';
import { BackNavigationButton } from '@flowmock/ui/controls/back-navigation-button.tsx';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { PANEL_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { useOutcomeToasts } from '@flowmock/ui/controls/outcome-toast.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button } = fluentComponents;

const RAW_PREVIEW = 200;

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  await requireAccess();
  const result = await callApi(() => api.recordings[':id'].$get({ param: { id: params.id } }));
  if (result.error?.status === 404) throw data(null, { status: 404, statusText: 'Not Found' });
  if (result.error) throw new Error(result.error.message, { cause: result.error });
  return result.data;
}

// An error frame outranks content: a stream that reports a failure inside a
// content-shaped event is read as the failure.
export const frameMarks = (frames: readonly RecordingFrame[]): TimelineMark[] => frames.map(frame => ({
  t: frame.t,
  kind: frame.error ? 'error' : frame.content ? 'content' : 'other',
  title: frame.event ?? frame.kind,
  detail: frame.raw.length > RAW_PREVIEW ? `${frame.raw.slice(0, RAW_PREVIEW)}…` : frame.raw,
}));

export default function CorpusDetail() {
  const recording = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const toasts = useOutcomeToasts();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const durationMs = Math.max(recording.response.endedAt, ...recording.frames.map(frame => frame.t), ...recording.response.chunks.map(chunk => chunk.t));
  const json = recording.response.wire === 'json' || recording.response.status >= 400;

  const remove = async () => {
    const result = await callApi(() => api.recordings[':id'].$delete({ param: { id: recording.id } }));
    if (result.error) {
      setDeleteError(result.error.message);
      return;
    }
    toasts.succeed(t('corpus.delete.done', { count: 1 }));
    await navigate('/corpus');
  };

  return <section className="dashboard-page">
    <div><BackNavigationButton to="/corpus">{t('nav.corpus')}</BackNavigationButton></div>
    <DashboardPageHeader
      actions={<Button onClick={() => setConfirming(true)}>{t('corpus.delete.action')}</Button>}
      description={`${recording.protocol} · ${dateTime(recording.createdAt, locale)} · ${recording.id}`}
      title={recording.model ?? recording.features.responseModel ?? recording.id}
    />
    {deleteError && <OutcomeMessageBar onDismiss={() => setDeleteError(null)} title={t('corpus.delete.failed')}>{deleteError}</OutcomeMessageBar>}

    <Panel><RecordingFacts recording={recording} /></Panel>

    <Panel className={PANEL_STACK_CLASS}>
      <SectionHeader description={t('corpus.detail.timelineDescription')} level={2} title={t('corpus.detail.timeline')} />
      <div className="grid gap-3">
        <TimelineLane label={t('corpus.detail.framesLane')}>
          <FrameTimeline durationMs={durationMs} label={t('corpus.detail.framesLane')} marks={frameMarks(recording.frames)} />
        </TimelineLane>
        <TimelineLane label={t('corpus.detail.chunksLane')}>
          <ChunkTimeline chunks={recording.response.chunks} durationMs={durationMs} label={t('corpus.detail.chunksLane')} />
        </TimelineLane>
        <TimelineLane label={recording.tokensEstimated ? t('corpus.detail.tokensLaneEstimated') : t('corpus.detail.tokensLane')}>
          <TokenCurve durationMs={durationMs} frames={recording.frames} label={t('corpus.detail.tokensLane')} />
        </TimelineLane>
        <TimelineAxis durationMs={durationMs} />
      </div>
    </Panel>

    <RequestView request={recording.request} />
    <ResponseView headers={recording.response.headers} json={json} recordingId={recording.id} status={recording.response.status} />

    <ConfirmDialog
      actionLabel={t('corpus.delete.action')}
      message={t('corpus.delete.message', { count: 1 })}
      onConfirm={() => { setConfirming(false); void remove(); }}
      onOpenChange={setConfirming}
      open={confirming}
      title={t('corpus.delete.title', { count: 1 })}
    />
  </section>;
}
