import { CodeRegular, DeleteRegular, EditRegular } from '@fluentui/react-icons';

import type { KeyBinding } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { compactDateTime } from '../../lib/format-time.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { RouteLink } from '@flowmock/ui/controls/route-link.tsx';
import { StatusBadge } from '@flowmock/ui/controls/status-badge.tsx';
import { TableTrailingCell, TableTrailingHeader } from '@flowmock/ui/controls/table-actions.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { TooltipIconButton } from '@flowmock/ui/controls/tooltip-icon-button.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

const COLUMN_WIDTHS = ['200px', null, '280px', '136px', '136px'];

export function KeyList({ items, onDelete, onEdit, onSnippets }: {
  items: readonly KeyBinding[];
  onDelete: (binding: KeyBinding) => void;
  onEdit: (binding: KeyBinding) => void;
  onSnippets: (binding: KeyBinding) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  return <Table aria-label={t('keys.title')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('keys.list.name')}</TableHeaderCell>
        <TableHeaderCell>{t('keys.list.key')}</TableHeaderCell>
        <TableHeaderCell>{t('keys.list.binding')}</TableHeaderCell>
        <TableHeaderCell>{t('keys.list.updated')}</TableHeaderCell>
        <TableTrailingHeader>{t('keys.list.actions')}</TableTrailingHeader>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(binding => <TableRow key={binding.key}>
        <TableCell><span className="block truncate">{binding.name}</span></TableCell>
        <TableCell><span className="block truncate font-mono">{binding.key}</span></TableCell>
        <TableCell>
          <span className="flex items-center gap-2 min-w-0">
            <StatusBadge tone={binding.mode === 'record' ? 'warning' : 'accent'}>{t(`keys.mode.${binding.mode}`)}</StatusBadge>
            <span className="truncate">{binding.mode === 'record'
              ? binding.targetId
              : <RouteLink to={`/scenarios/${binding.scenario}`}>{binding.scenario}</RouteLink>}</span>
          </span>
        </TableCell>
        <TableCell>{compactDateTime(binding.updatedAt, locale)}</TableCell>
        <TableTrailingCell>
          <TooltipIconButton icon={<CodeRegular />} label={t('keys.actions.snippets')} onClick={() => onSnippets(binding)} />
          <TooltipIconButton icon={<EditRegular />} label={t('keys.actions.edit')} onClick={() => onEdit(binding)} />
          <TooltipIconButton danger icon={<DeleteRegular />} label={t('keys.actions.delete')} onClick={() => onDelete(binding)} />
        </TableTrailingCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
