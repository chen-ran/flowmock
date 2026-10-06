import type { CassetteDetail } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { compactDateTime } from '../../lib/format-time.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { outcomeTone } from '../../lib/outcome.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

type SequenceRecording = CassetteDetail['recordings'][number];

// The recordings in the order a sequence scenario walks them, each with the
// time since the one before: the pacing a client produced when it was
// recorded, which a recorded-timing replay of the cassette reproduces.
export const sequenceRows = (recordings: readonly SequenceRecording[]) => {
  const ordered = [...recordings].sort((a, b) => (a.cassetteSeq ?? 0) - (b.cassetteSeq ?? 0) || a.createdAt - b.createdAt);
  return ordered.map((recording, index) => ({
    recording,
    gapMs: index === 0 ? null : recording.createdAt - ordered[index - 1]!.createdAt,
  }));
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+|-+$/g, '') || 'cassette';

// A scenario that replays the cassette in recorded order and recorded timing,
// failing loudly once the cassette is used up rather than quietly reusing it.
export const sequenceScenarioYaml = (cassette: { id: string; name: string }): string => [
  `# Replays cassette "${cassette.name}" (${cassette.id}) in recorded order.`,
  `name: seq-${slug(cassette.name)}`,
  'selection:',
  '  mode: sequence',
  `  cassette: ${cassette.id}`,
  '  onEnd: error',
  'timing: { mode: recorded }',
  '',
].join('\n');

const COLUMN_WIDTHS = ['56px', '136px', '96px', null, '200px', '140px', '84px'];

export function CassetteSequence({ recordings }: { recordings: readonly SequenceRecording[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return <Table aria-label={t('cassettes.detail.sequence')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('cassettes.detail.seq')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.time')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.detail.gap')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.model')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.outcome')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.detail.stopReason')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.ttft')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {sequenceRows(recordings).map(({ gapMs, recording }) => <TableRow data-seq={recording.cassetteSeq} key={recording.id}>
        <TableCell>{recording.cassetteSeq ?? NO_READING}</TableCell>
        <TableCell>{compactDateTime(recording.createdAt, locale)}</TableCell>
        <TableCell>{gapMs === null ? NO_READING : `+${formatDuration(gapMs)}`}</TableCell>
        <TableCell><span className="block truncate"><RouteLink to={`/corpus/${recording.id}`}>{recording.model ?? recording.id}</RouteLink></span></TableCell>
        <TableCell><StatusBadge tone={outcomeTone(recording.features.outcome)}>{recording.features.outcome}</StatusBadge></TableCell>
        <TableCell>{recording.features.stopReason ?? NO_READING}</TableCell>
        <TableCell>{formatDuration(recording.features.ttftMs)}</TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
