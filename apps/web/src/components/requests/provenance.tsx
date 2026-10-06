import { useTranslation } from '../../i18n/translation.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } = fluentComponents;

// What each transform did to the recording on its way to the client, in the
// order the transforms ran.
export function ProvenanceTable({ entries }: { entries: ReadonlyArray<{ transform: string; detail: string }> }) {
  const { t } = useTranslation();
  return <Table aria-label={t('requests.provenance.title')} size="small">
    <TableHeader>
      <TableRow>
        <TableHeaderCell className="w-[180px]">{t('requests.provenance.transform')}</TableHeaderCell>
        <TableHeaderCell>{t('requests.provenance.change')}</TableHeaderCell>
      </TableRow>
    </TableHeader>
    <TableBody>
      {entries.map((entry, index) => <TableRow key={index}>
        <TableCell><span className="font-mono">{entry.transform}</span></TableCell>
        <TableCell><span className="break-words">{entry.detail}</span></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
