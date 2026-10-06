import { DeleteRegular, EditRegular } from '@fluentui/react-icons';

import type { RecordingTarget } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { TableTrailingCell, TableTrailingHeader } from '@flowmock/ui/controls/table-actions.tsx';
import { TableColumns } from '@flowmock/ui/controls/table-columns.tsx';
import { TooltipIconButton } from '@flowmock/ui/controls/tooltip-icon-button.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

const COLUMN_WIDTHS = ['160px', '180px', null, '280px', '96px'];

// The header values are the server's masks: this page never holds a target's
// secrets after they are saved.
export function TargetList({ items, onDelete, onEdit }: {
  items: readonly RecordingTarget[];
  onDelete: (target: RecordingTarget) => void;
  onEdit: (target: RecordingTarget) => void;
}) {
  const { t } = useTranslation();
  return <Table aria-label={t('keys.targets.title')}>
    <TableColumns widths={COLUMN_WIDTHS} />
    <TableHeader>
      <TableRow>
        <TableHeaderCell>{t('keys.targets.list.id')}</TableHeaderCell>
        <TableHeaderCell>{t('keys.targets.list.name')}</TableHeaderCell>
        <TableHeaderCell>{t('keys.targets.list.baseUrl')}</TableHeaderCell>
        <TableHeaderCell>{t('keys.targets.list.headers')}</TableHeaderCell>
        <TableTrailingHeader>{t('keys.list.actions')}</TableTrailingHeader>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(target => <TableRow key={target.id}>
        <TableCell><span className="block truncate font-mono">{target.id}</span></TableCell>
        <TableCell><span className="block truncate">{target.name}</span></TableCell>
        <TableCell><span className="block truncate font-mono">{target.baseUrl}</span></TableCell>
        <TableCell>
          <span className="grid min-w-0">
            {Object.keys(target.headers).length === 0
              ? NO_READING
              : Object.entries(target.headers).map(([name, masked]) => <span className="truncate font-mono" key={name}>{`${name}: ${masked}`}</span>)}
          </span>
        </TableCell>
        <TableTrailingCell>
          <TooltipIconButton icon={<EditRegular />} label={t('keys.actions.edit')} onClick={() => onEdit(target)} />
          <TooltipIconButton danger icon={<DeleteRegular />} label={t('keys.actions.delete')} onClick={() => onDelete(target)} />
        </TableTrailingCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
