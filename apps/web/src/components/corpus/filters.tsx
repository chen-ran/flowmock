import { useState } from 'react';

import { useTranslation } from '../../i18n/translation.ts';
import { OUTCOME_FILTERS } from '../../lib/outcome.ts';
import { PROTOCOLS } from '@flowmock/protocols/common';
import { Dropdown, Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, Field, Option } = fluentComponents;

export interface CorpusFilterValues {
  protocol: string;
  outcome: string;
  model: string;
  q: string;
}

// The filters live in the address, so a filtered list can be shared and
// survives a reload. The choices apply at once; the two text fields apply on
// submit, so the list is not refetched on every keystroke.
export function CorpusFilters({ onChange, values }: { onChange: (next: CorpusFilterValues) => void; values: CorpusFilterValues }) {
  const { t } = useTranslation();
  const [model, setModel] = useState(values.model);
  const [q, setQ] = useState(values.q);
  const [applied, setApplied] = useState(values);
  // The fields follow a change made elsewhere -- a cleared filter, the back
  // button -- without discarding what the reader is typing otherwise.
  if (applied !== values) {
    setApplied(values);
    setModel(values.model);
    setQ(values.q);
  }
  const all = t('corpus.filters.all');

  return <form
    className="flex flex-wrap items-end gap-3"
    onSubmit={event => {
      event.preventDefault();
      onChange({ ...values, model: model.trim(), q: q.trim() });
    }}
  >
    <Field label={t('corpus.filters.protocol')}>
      <Dropdown
        onOptionSelect={(_, data) => onChange({ ...values, protocol: data.optionValue ?? '' })}
        selectedOptions={[values.protocol]}
        value={values.protocol || all}
      >
        <Option value="">{all}</Option>
        {PROTOCOLS.map(protocol => <Option key={protocol} value={protocol}>{protocol}</Option>)}
      </Dropdown>
    </Field>
    <Field label={t('corpus.filters.outcome')}>
      <Dropdown
        onOptionSelect={(_, data) => onChange({ ...values, outcome: data.optionValue ?? '' })}
        selectedOptions={[values.outcome]}
        value={values.outcome || all}
      >
        <Option value="">{all}</Option>
        {OUTCOME_FILTERS.map(outcome => <Option key={outcome} value={outcome}>{outcome}</Option>)}
      </Dropdown>
    </Field>
    <Field label={t('corpus.filters.model')}>
      <Input onChange={(_, data) => setModel(data.value)} placeholder={t('corpus.filters.modelPlaceholder')} value={model} />
    </Field>
    <Field label={t('corpus.filters.search')}>
      <Input onChange={(_, data) => setQ(data.value)} placeholder={t('corpus.filters.searchPlaceholder')} value={q} />
    </Field>
    <Button type="submit">{t('corpus.filters.apply')}</Button>
  </form>;
}
