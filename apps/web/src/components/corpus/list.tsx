import type { RecordingSummary } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { formatDuration } from '../../lib/format-duration.ts';
import { formatTokenRate, formatTokens } from '../../lib/format-number.ts';
import { compactDateTime } from '../../lib/format-time.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { outcomeTone } from '../../lib/outcome.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { TruncationTooltip } from '@flowmock/ui/controls/truncation-tooltip.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, TableSelectionCell } = fluentComponents;

// The model column absorbs what the fixed columns leave, and a name cut short
// there is shown whole on hover.
const COLUMN_WIDTHS = ['44px', '136px', null, '176px', '168px', '64px', '72px', '88px', '80px', '56px', '76px'];

function ModelLink({ id, model }: { id: string; model: string }) {
  return <TruncationTooltip content={model} relationship="description">
    {measureRef => <span className="block truncate" ref={measureRef}><RouteLink to={`/corpus/${id}`}>{model}</RouteLink></span>}
  </TruncationTooltip>;
}

export function RecordingList({ items, onSelectionChange, selected }: {
  items: readonly RecordingSummary[];
  onSelectionChange: (next: Set<string>) => void;
  selected: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const allSelected = items.length > 0 && items.every(item => selected.has(item.id));
  const someSelected = !allSelected && items.some(item => selected.has(item.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  return <Table aria-label={t('nav.corpus')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableSelectionCell
          checkboxIndicator={{ 'aria-label': t('corpus.list.selectAll') }}
          checked={allSelected ? true : someSelected ? 'mixed' : false}
          onClick={() => onSelectionChange(allSelected ? new Set() : new Set(items.map(item => item.id)))}
        />
        <TableHeaderCell>{t('corpus.list.time')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.model')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.protocol')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.outcome')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.stream')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.ttft')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.tps')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.outputTokens')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.tools')}</TableHeaderCell>
        <TableHeaderCell>{t('corpus.list.cassette')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(item => <TableRow aria-selected={selected.has(item.id)} key={item.id}>
        <TableSelectionCell
          checkboxIndicator={{ 'aria-label': t('corpus.list.select', { id: item.id }) }}
          checked={selected.has(item.id)}
          onClick={() => toggle(item.id)}
        />
        <TableCell>{compactDateTime(item.createdAt, locale)}</TableCell>
        <TableCell><ModelLink id={item.id} model={item.model ?? item.features.responseModel ?? item.id} /></TableCell>
        <TableCell><span className="block truncate">{item.protocol}</span></TableCell>
        <TableCell><StatusBadge tone={outcomeTone(item.features.outcome)}>{item.features.outcome}</StatusBadge></TableCell>
        <TableCell>{item.features.stream ? t('corpus.list.yes') : t('corpus.list.no')}</TableCell>
        <TableCell>{formatDuration(item.features.ttftMs)}</TableCell>
        <TableCell>{formatTokenRate(item.features.tps)}</TableCell>
        <TableCell>{formatTokens(item.features.outputTokens, locale)}</TableCell>
        <TableCell>{item.features.toolCalls}</TableCell>
        <TableCell>{item.cassetteId === null
          ? NO_READING
          : <RouteLink to={`/cassettes/${item.cassetteId}`}>{t('corpus.list.cassetteSeq', { seq: String(item.cassetteSeq ?? '?') })}</RouteLink>}</TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
