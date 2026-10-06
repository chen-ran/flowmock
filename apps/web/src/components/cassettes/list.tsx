import type { CassetteSummary } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { compactDateTime } from '../../lib/format-time.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

const COLUMN_WIDTHS = [null, '136px', '160px', '160px', '180px', '96px', '96px'];

export function CassetteList({ items }: { items: readonly CassetteSummary[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return <Table aria-label={t('nav.cassettes')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('cassettes.list.name')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.list.created')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.list.key')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.list.target')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.list.session')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.list.recordings')}</TableHeaderCell>
        <TableHeaderCell>{t('cassettes.list.state')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(item => <TableRow key={item.id}>
        <TableCell><span className="block truncate"><RouteLink to={`/cassettes/${item.id}`}>{item.name}</RouteLink></span></TableCell>
        <TableCell>{compactDateTime(item.createdAt, locale)}</TableCell>
        <TableCell><span className="block truncate">{item.keyName ?? NO_READING}</span></TableCell>
        <TableCell><span className="block truncate">{item.targetId ?? NO_READING}</span></TableCell>
        <TableCell><span className="block truncate font-mono">{item.sessionId ?? NO_READING}</span></TableCell>
        <TableCell>{item.recordings}</TableCell>
        <TableCell>{item.closedAt === null
          ? <StatusBadge tone="accent">{t('cassettes.state.open')}</StatusBadge>
          : <StatusBadge tone="neutral">{t('cassettes.state.closed')}</StatusBadge>}</TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
