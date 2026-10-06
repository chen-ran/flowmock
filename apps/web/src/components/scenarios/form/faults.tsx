import { Add20Regular, Delete20Regular } from '@fluentui/react-icons';
import { useState } from 'react';

import { NumberField } from './fields.tsx';
import { callIndexText, type FaultRuleForm, type FaultType, parseCallIndex } from './model.ts';
import { useTranslation } from '../../../i18n/translation.ts';
import { Dropdown, Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { TooltipIconButton } from '@flowmock/ui/controls/tooltip-icon-button.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, Field, Option, Text } = fluentComponents;

const GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3';
const TYPES: readonly FaultType[] = ['http_error', 'stream_error_event', 'interrupt', 'concurrency_limit'];
const INTERRUPT_MODES = ['reset', 'abort', 'fin', 'hang', 'ws_close', 'ws_terminate'] as const;
// The types that can take their error from a recording.
const FROM_RECORDING: ReadonlySet<FaultType> = new Set(['http_error', 'stream_error_event', 'concurrency_limit']);

type When = NonNullable<FaultRuleForm['when']>;
type Inject = FaultRuleForm['inject'];

// A new rule fires on a session's third call with the corpus's recorded 429,
// the case a client's retry logic is most often written against.
const NEW_RULE: FaultRuleForm = { when: { callIndex: 3 }, inject: { type: 'http_error', from: { outcome: 'http_error:429' } } };

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function CallIndexField({ onChange, value }: { onChange: (value: When['callIndex']) => void; value: When['callIndex'] }) {
  const { t } = useTranslation();
  const [text, setText] = useState(callIndexText(value));
  const [synced, setSynced] = useState(value);
  if (!sameValue(synced, value)) {
    setSynced(value);
    setText(callIndexText(value));
  }
  const invalid = parseCallIndex(text) === null;
  return <Field
    hint={t('scenarios.form.faults.callIndexHint')}
    label={t('scenarios.form.faults.callIndex')}
    validationMessage={invalid ? t('scenarios.form.faults.callIndexInvalid') : undefined}
    validationState={invalid ? 'error' : undefined}
  >
    <Input
      onChange={(_, data) => {
        setText(data.value);
        const next = parseCallIndex(data.value);
        if (next === null) return;
        setSynced(next);
        onChange(next);
      }}
      value={text}
    />
  </Field>;
}

function TextField({ label, onChange, placeholder, value }: { label: string; onChange: (value: string | undefined) => void; placeholder?: string; value: string | undefined }) {
  return <Field label={label}>
    <Input onChange={(_, data) => onChange(data.value === '' ? undefined : data.value)} placeholder={placeholder} value={value ?? ''} />
  </Field>;
}

const withType = (type: FaultType, previous: Inject): Inject => ({
  type,
  ...(FROM_RECORDING.has(type) && previous.from !== undefined && { from: previous.from }),
  // A concurrency limit has no default ceiling.
  ...(type === 'concurrency_limit' && { max: 1 }),
});

function FaultRule({ index, onChange, onRemove, rule }: { index: number; onChange: (rule: FaultRuleForm) => void; onRemove: () => void; rule: FaultRuleForm }) {
  const { t } = useTranslation();
  const when = rule.when ?? {};
  const inject = rule.inject;
  const setWhen = (next: Partial<When>) => onChange({ ...rule, when: { ...when, ...next } });
  const setInject = (next: Partial<Inject>) => onChange({ ...rule, inject: { ...inject, ...next } });
  const from = inject.from as { outcome?: string } | undefined;
  const fraction = (inject.at as { fraction?: number } | undefined)?.fraction;
  const outcomeField = <TextField
    label={t('scenarios.form.faults.recordedError')}
    onChange={outcome => setInject({ from: outcome === undefined ? undefined : { ...from, outcome } })}
    placeholder="http_error:429"
    value={from?.outcome}
  />;
  const positionField = <NumberField
    hint={t('scenarios.form.faults.positionHint')}
    label={t('scenarios.form.faults.position')}
    onChange={next => setInject({ at: next === undefined ? undefined : { fraction: next } })}
    placeholder="0.5"
    value={fraction}
  />;
  const statusField = <NumberField label={t('scenarios.form.faults.status')} onChange={status => setInject({ status })} value={inject.status as number | undefined} />;

  return <section aria-label={t('scenarios.form.faults.rule', { index: index + 1 })} className="grid gap-3 rounded-[var(--borderRadiusMedium)] border border-solid border-fui-divider p-3">
    <div className="flex items-center justify-between gap-2">
      <Text weight="semibold">{t('scenarios.form.faults.rule', { index: index + 1 })}</Text>
      <TooltipIconButton icon={<Delete20Regular />} label={t('scenarios.form.faults.remove', { index: index + 1 })} onClick={onRemove} />
    </div>
    <div className={GRID_CLASS}>
      <CallIndexField onChange={callIndex => setWhen({ callIndex })} value={when.callIndex} />
      <NumberField label={t('scenarios.form.faults.everyN')} onChange={everyN => setWhen({ everyN })} value={when.everyN} />
      <NumberField hint={t('scenarios.form.faults.probabilityHint')} label={t('scenarios.form.faults.probability')} onChange={probability => setWhen({ probability })} value={when.probability} />
    </div>
    <div className={GRID_CLASS}>
      <Field label={t('scenarios.form.faults.type')}>
        <Dropdown
          onOptionSelect={(_, data) => onChange({ ...rule, inject: withType(data.optionValue as FaultType, inject) })}
          selectedOptions={[inject.type]}
          value={t(`scenarios.form.faults.types.${inject.type}`)}
        >
          {TYPES.map(type => <Option key={type} value={type}>{t(`scenarios.form.faults.types.${type}`)}</Option>)}
        </Dropdown>
      </Field>
      {inject.type === 'http_error' && <>
        {outcomeField}
        {statusField}
        <NumberField label={t('scenarios.form.faults.delay')} onChange={delayMs => setInject({ delayMs })} value={inject.delayMs as number | undefined} />
      </>}
      {inject.type === 'stream_error_event' && <>{outcomeField}{positionField}</>}
      {inject.type === 'interrupt' && <>
        <Field label={t('scenarios.form.faults.mode')}>
          <Dropdown
            onOptionSelect={(_, data) => setInject({ mode: data.optionValue })}
            selectedOptions={[(inject.mode as string | undefined) ?? 'reset']}
            value={t(`scenarios.form.faults.interruptModes.${(inject.mode as typeof INTERRUPT_MODES[number] | undefined) ?? 'reset'}`)}
          >
            {INTERRUPT_MODES.map(mode => <Option key={mode} value={mode}>{t(`scenarios.form.faults.interruptModes.${mode}`)}</Option>)}
          </Dropdown>
        </Field>
        {positionField}
      </>}
      {inject.type === 'concurrency_limit' && <>
        <NumberField label={t('scenarios.form.faults.max')} onChange={max => setInject({ max })} value={inject.max as number | undefined} />
        {statusField}
      </>}
    </div>
  </section>;
}

// The rules that inject failures, in the order they are tried; the first whose
// trigger fires wins.
export function FaultsSection({ onChange, value }: { onChange: (value: FaultRuleForm[] | undefined) => void; value: FaultRuleForm[] | undefined }) {
  const { t } = useTranslation();
  const rules = value ?? [];
  return <div className="grid gap-3">
    {rules.length === 0 && <Text className="text-fui-fg2">{t('scenarios.form.faults.none')}</Text>}
    {rules.map((rule, index) => <FaultRule
      index={index}
      // Rules have no identity of their own; the position is what the
      // document and the server know them by.
      key={index}
      onChange={next => onChange(rules.map((item, at) => (at === index ? next : item)))}
      onRemove={() => {
        const next = rules.filter((_, at) => at !== index);
        onChange(next.length === 0 ? undefined : next);
      }}
      rule={rule}
    />)}
    <div><Button icon={<Add20Regular />} onClick={() => onChange([...rules, structuredClone(NEW_RULE)])}>{t('scenarios.form.faults.add')}</Button></div>
  </div>;
}
