import { useState } from 'react';

import type { Distribution } from './model.ts';
import { useTranslation } from '../../../i18n/translation.ts';
import { Dropdown, Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Field, Option } = fluentComponents;

const numberText = (value: number | undefined) => (value === undefined ? '' : String(value));

// A number the reader types freely. The text stands as typed while it means
// the value, so "0." on the way to "0.5" is kept and a mistyped value stays to
// be corrected; a value that changes from outside -- in the YAML -- replaces
// it. An empty field is the field left out of the scenario.
export function NumberField({ hint, label, onChange, placeholder, value }: {
  hint?: string;
  label: string;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  value: number | undefined;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(numberText(value));
  const [synced, setSynced] = useState(value);
  if (!Object.is(synced, value)) {
    setSynced(value);
    setText(numberText(value));
  }
  const invalid = text.trim() !== '' && !Number.isFinite(Number(text.trim()));
  return <Field
    hint={hint}
    label={label}
    validationMessage={invalid ? t('scenarios.form.notANumber') : undefined}
    validationState={invalid ? 'error' : undefined}
  >
    <Input
      inputMode="decimal"
      onChange={(_, data) => {
        setText(data.value);
        const trimmed = data.value.trim();
        const next = trimmed === '' ? undefined : Number(trimmed);
        if (next !== undefined && !Number.isFinite(next)) return;
        setSynced(next);
        onChange(next);
      }}
      placeholder={placeholder}
      value={text}
    />
  </Field>;
}

const KINDS = ['constant', 'fixed', 'uniform', 'normal-mean', 'normal-percentiles', 'lognormal'] as const;
type DistributionKind = typeof KINDS[number];
type Param = 'value' | 'min' | 'max' | 'mean' | 'sd' | 'p50' | 'p95';

const PARAMS: Record<DistributionKind, readonly Param[]> = {
  'constant': ['value'],
  'fixed': ['value'],
  'uniform': ['min', 'max'],
  'normal-mean': ['mean', 'sd'],
  'normal-percentiles': ['p50', 'p95'],
  'lognormal': ['p50', 'p95'],
};

const kindOf = (value: Distribution | undefined): DistributionKind => {
  if (value === undefined || typeof value === 'number') return 'constant';
  if (value.dist === 'normal') return value.p50 !== undefined || value.p95 !== undefined ? 'normal-percentiles' : 'normal-mean';
  return value.dist;
};

const paramOf = (value: Distribution | undefined, param: Param): number | undefined =>
  typeof value === 'number' ? (param === 'value' ? value : undefined) : (value as Partial<Record<Param, number>> | undefined)?.[param];

// The median core plans an unsampled preview with, carried over when the kind
// changes so a constant 800 becomes a lognormal centred on 800 rather than an
// empty one.
const medianOf = (value: Distribution | undefined): number | undefined => {
  if (value === undefined || typeof value === 'number') return value;
  switch (value.dist) {
  case 'fixed': return value.value;
  case 'uniform': return value.min !== undefined && value.max !== undefined ? (value.min + value.max) / 2 : value.min ?? value.max;
  case 'normal': return value.mean ?? value.p50;
  case 'lognormal': return value.p50;
  }
};

const withKind = (kind: DistributionKind, median: number | undefined): Distribution => {
  const m = median ?? 0;
  switch (kind) {
  case 'constant': return m;
  case 'fixed': return { dist: 'fixed', value: m };
  case 'uniform': return { dist: 'uniform', min: m, max: m };
  case 'normal-mean': return { dist: 'normal', mean: m, sd: 0 };
  case 'normal-percentiles': return { dist: 'normal', p50: m, p95: m };
  // Lognormal needs a positive median.
  case 'lognormal': return { dist: 'lognormal', p50: m || 1, p95: m || 1 };
  }
};

// One of the distributions core samples from: a constant, or a named
// distribution with the parameters it takes.
export function DistributionField({ label, onChange, unit, value }: {
  label: string;
  onChange: (value: Distribution | undefined) => void;
  unit: string;
  value: Distribution | undefined;
}) {
  const { t } = useTranslation();
  const kind = kindOf(value);
  const setParam = (param: Param, next: number | undefined) => {
    if (kind === 'constant') onChange(next);
    else onChange({ ...(value as Exclude<Distribution, number>), [param]: next } as Distribution);
  };
  return <fieldset className="grid gap-2 m-0 p-0 border-none min-w-0">
    <Field label={label}>
      <Dropdown
        onOptionSelect={(_, data) => onChange(withKind(data.optionValue as DistributionKind, medianOf(value)))}
        selectedOptions={[kind]}
        value={t(`scenarios.form.distribution.kinds.${kind}`)}
      >
        {KINDS.map(option => <Option key={option} value={option}>{t(`scenarios.form.distribution.kinds.${option}`)}</Option>)}
      </Dropdown>
    </Field>
    <div className="grid grid-cols-2 gap-3">
      {PARAMS[kind].map(param => <NumberField
        key={`${kind}-${param}`}
        label={t('scenarios.form.distribution.param', { param: t(`scenarios.form.distribution.params.${param}`), unit })}
        onChange={next => setParam(param, next)}
        value={paramOf(value, param)}
      />)}
    </div>
  </fieldset>;
}
