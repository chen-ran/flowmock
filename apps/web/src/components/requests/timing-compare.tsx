import type { RequestDetail } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatTokenRate } from '../../lib/format-number.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

export interface TimingRow {
  metric: 'ttft' | 'tps' | 'duration';
  planned: string;
  achieved: string;
  difference: string;
}

const signed = (planned: number | null, achieved: number | null, format: (value: number) => string): string => {
  if (planned === null || achieved === null) return NO_READING;
  const delta = achieved - planned;
  return `${delta < 0 ? '−' : '+'}${format(Math.abs(delta))}`;
};

// Speeds below the reading's floor still differ; the difference keeps them.
const rate = (value: number) => (value === 0 ? '0 tok/s' : formatTokenRate(value));

// What the plan promised beside what the wire measured: the time the first
// output-carrying write went out, the decode speed between the first and the
// last, and when the response ended.
export const timingRows = (expected: NonNullable<RequestDetail['expected']>, result: NonNullable<RequestDetail['result']>): TimingRow[] => [
  { metric: 'ttft', planned: formatDuration(expected.ttftMs), achieved: formatDuration(result.achievedTtftMs), difference: signed(expected.ttftMs, result.achievedTtftMs, formatDuration) },
  { metric: 'tps', planned: formatTokenRate(expected.tps), achieved: formatTokenRate(result.achievedTps), difference: signed(expected.tps, result.achievedTps, rate) },
  { metric: 'duration', planned: formatDuration(expected.durationMs), achieved: formatDuration(result.endedAt), difference: signed(expected.durationMs, result.endedAt, formatDuration) },
];

export function TimingCompare({ expected, result }: { expected: NonNullable<RequestDetail['expected']>; result: NonNullable<RequestDetail['result']> }) {
  const { t } = useTranslation();
  return <Table aria-label={t('requests.timing.title')} size="small">
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('requests.timing.metric')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.timing.planned')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.timing.achieved')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.timing.difference')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {timingRows(expected, result).map(row => <TableRow key={row.metric}>
        <TableCell>{t(`requests.timing.metrics.${row.metric}`)}</TableCell>
        <TableCell><span className="tabular-nums">{row.planned}</span></TableCell>
        <TableCell><span className="tabular-nums">{row.achieved}</span></TableCell>
        <TableCell><span className="tabular-nums">{row.difference}</span></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
