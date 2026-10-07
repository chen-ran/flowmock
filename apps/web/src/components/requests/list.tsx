import type { RequestSummary } from './summary.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatTokenRate } from '../../lib/format-number.ts';
import { compactDateTime } from '../../lib/format-time.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { requestOutcomeTone, statusTone } from '../../lib/outcome.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { TruncationTooltip } from '@flowmock/ui/controls/truncation-tooltip.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

const COLUMN_WIDTHS = ['150px', '88px', '140px', null, '76px', '128px', '112px', '104px', '150px'];

function Truncated({ text }: { text: string }) {
  return <TruncationTooltip content={text} relationship="description">
    {measureRef => <span className="block truncate" ref={measureRef}>{text}</span>}
  </TruncationTooltip>;
}

export function RequestList({ items }: { items: readonly RequestSummary[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return <Table aria-label={t('nav.requests')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('requests.list.time')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.mode')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.key')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.model')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.status')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.outcome')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.ttft')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.tps')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.list.fault')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(item => <TableRow key={item.id}>
        <TableCell><RouteLink to={`/requests/${item.id}`}>{compactDateTime(item.startedAt, locale)}</RouteLink></TableCell>
        <TableCell>{t(`requests.mode.${item.mode}`)}</TableCell>
        <TableCell><Truncated text={item.keyName} /></TableCell>
        <TableCell><Truncated text={item.model ?? NO_READING} /></TableCell>
        <TableCell>{item.status === null ? NO_READING : <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>}</TableCell>
        <TableCell>{item.outcome === null ? NO_READING : <StatusBadge tone={requestOutcomeTone(item.outcome, item.status)}>{item.outcome}</StatusBadge>}</TableCell>
        <TableCell>{formatDuration(item.achievedTtftMs)}</TableCell>
        <TableCell>{formatTokenRate(item.achievedTps)}</TableCell>
        <TableCell><span className="block truncate">{item.fault === null ? NO_READING : t(`scenarios.form.faults.types.${item.fault as 'http_error'}`)}</span></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
