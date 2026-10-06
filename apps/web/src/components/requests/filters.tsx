import type { RequestFilterValues } from './summary.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { PROTOCOLS } from '@flowmock/protocols/common';
import { Dropdown } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Field, Option } = fluentComponents;

// A replay ends completed, interrupted, client_aborted or failed; a recording
// with the upstream's outcome, of which the fixed ones are offered.
const OUTCOMES = ['completed', 'interrupted', 'client_aborted', 'failed', 'ok', 'truncated', 'network_error'] as const;
const STATUS_CLASSES = ['2xx', '4xx', '5xx'] as const;

// Every filter applies at once and lives in the address.
export function RequestFilters({ keys, onChange, values }: { keys: readonly string[]; onChange: (next: RequestFilterValues) => void; values: RequestFilterValues }) {
  const { t } = useTranslation();
  const all = t('requests.filters.all');
  const choice = (field: keyof RequestFilterValues, label: string, options: readonly string[], optionLabel: (value: string) => string = value => value) =>
    <Field label={label}>
      <Dropdown
        onOptionSelect={(_, data) => onChange({ ...values, [field]: data.optionValue ?? '' })}
        selectedOptions={[values[field]]}
        value={values[field] ? optionLabel(values[field]) : all}
      >
        <Option value="">{all}</Option>
        {options.map(option => <Option key={option} text={optionLabel(option)} value={option}>{optionLabel(option)}</Option>)}
      </Dropdown>
    </Field>;
  return <div className="flex flex-wrap items-end gap-3">
    {choice('mode', t('requests.filters.mode'), ['replay', 'record'], value => t(`requests.mode.${value as 'replay' | 'record'}`))}
    {choice('key', t('requests.filters.key'), keys)}
    {choice('protocol', t('requests.filters.protocol'), PROTOCOLS)}
    {choice('status', t('requests.filters.status'), STATUS_CLASSES)}
    {choice('outcome', t('requests.filters.outcome'), OUTCOMES)}
  </div>;
}
