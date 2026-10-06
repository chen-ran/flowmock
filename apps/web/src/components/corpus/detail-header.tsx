import type { ReactNode } from 'react';

import type { RecordingDetail } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatBytes, formatTokenRate, formatTokens } from '../../lib/format-number.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { outcomeTone } from '../../lib/outcome.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Text } = fluentComponents;

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return <div className="grid gap-1 min-w-0">
    <Text className="text-fui-fg2" size={200}>{label}</Text>
    <div className="min-w-0 break-words">{children}</div>
  </div>;
}

// What a recording is, at a glance: how it ended, how fast it streamed, and
// where it sits in the corpus.
export function RecordingFacts({ recording }: { recording: RecordingDetail }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { features } = recording;
  const estimated = recording.tokensEstimated ? ` ${t('corpus.detail.estimated')}` : '';
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-4">
    <Fact label={t('corpus.list.outcome')}><StatusBadge tone={outcomeTone(features.outcome)}>{features.outcome}</StatusBadge></Fact>
    <Fact label={t('corpus.detail.status')}><Text>{recording.response.status}</Text></Fact>
    <Fact label={t('corpus.list.stream')}><Text>{features.stream ? t('corpus.list.yes') : t('corpus.list.no')}</Text></Fact>
    <Fact label={t('corpus.detail.stopReason')}><Text>{features.stopReason ?? NO_READING}</Text></Fact>
    <Fact label={t('corpus.list.ttft')}><Text>{formatDuration(features.ttftMs)}</Text></Fact>
    <Fact label={t('corpus.list.tps')}><Text>{formatTokenRate(features.tps)}</Text></Fact>
    <Fact label={t('corpus.detail.duration')}><Text>{formatDuration(features.durationMs)}</Text></Fact>
    <Fact label={t('corpus.detail.inputTokens')}><Text>{formatTokens(features.inputTokens, locale)}</Text></Fact>
    <Fact label={t('corpus.list.outputTokens')}><Text>{`${formatTokens(features.outputTokens, locale)}${estimated}`}</Text></Fact>
    <Fact label={t('corpus.list.tools')}><Text>{features.toolNames.length > 0 ? features.toolNames.join(', ') : NO_READING}</Text></Fact>
    <Fact label={t('corpus.detail.frames')}><Text>{features.frames}</Text></Fact>
    <Fact label={t('corpus.detail.bytes')}><Text>{formatBytes(features.bytes, locale)}</Text></Fact>
    <Fact label={t('corpus.list.cassette')}>{recording.cassetteId === null
      ? <Text>{NO_READING}</Text>
      : <RouteLink to={`/cassettes/${recording.cassetteId}`}>{t('corpus.list.cassetteSeq', { seq: String(recording.cassetteSeq ?? '?') })}</RouteLink>}</Fact>
    <Fact label={t('corpus.detail.transport')}><Text>{recording.transport}</Text></Fact>
  </div>;
}
