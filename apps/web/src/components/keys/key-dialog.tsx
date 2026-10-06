import { useState } from 'react';

import { api, callApi } from '../../api/client.ts';
import type { KeyBinding, RecordingTarget, ScenarioSummary } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { ChoiceGroup } from '@flowmock/ui/controls/choice-group.tsx';
import { DialogShell } from '@flowmock/ui/controls/dialog-shell.tsx';
import { Dropdown, Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, DialogActions, DialogTitle, Field, Option } = fluentComponents;

const MIN_KEY_LENGTH = 8;

// A mock key is what a client presents instead of a vendor's, so it only has to
// be unique and recognisable as FlowMock's, not secret.
export const generateKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `fm-${[...bytes].map(byte => (byte % 36).toString(36)).join('')}`;
};

type Mode = 'record' | 'replay';

// One key, bound either to a recording target or to a replay scenario -- never
// both, as the server requires. Editing keeps the key itself: it is the
// identity every client already holds.
export function KeyDialog({ binding, onOpenChange, onSaved, open, scenarios, targets }: {
  binding: KeyBinding | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (key: string) => void;
  open: boolean;
  scenarios: readonly ScenarioSummary[];
  targets: readonly RecordingTarget[];
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState(binding?.key ?? generateKey());
  const [name, setName] = useState(binding?.name ?? '');
  const [mode, setMode] = useState<Mode>(binding?.mode ?? 'replay');
  const [target, setTarget] = useState(binding?.targetId ?? targets[0]?.id ?? '');
  const [scenario, setScenario] = useState(binding?.scenario ?? scenarios[0]?.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const keyError = key.length < MIN_KEY_LENGTH ? t('keys.dialog.keyTooShort', { count: MIN_KEY_LENGTH }) : null;
  const bindingError = mode === 'record' ? (target ? null : t('keys.dialog.targetRequired')) : (scenario ? null : t('keys.dialog.scenarioRequired'));

  const save = async () => {
    setSubmitted(true);
    if (keyError || bindingError) return;
    setSaving(true);
    const body = { key, ...(name.trim() && { name: name.trim() }), ...(mode === 'record' ? { record: target } : { replay: scenario }) };
    const result = await callApi(() => api.keys.$post({ json: body }));
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved(key);
  };

  return <DialogShell
    actions={<DialogActions>
      <Button onClick={() => onOpenChange(false)}>{t('keys.dialog.cancel')}</Button>
      <Button appearance="primary" disabledFocusable={saving} type="submit">{t('keys.dialog.save')}</Button>
    </DialogActions>}
    onOpenChange={(_, data) => onOpenChange(data.open)}
    onSubmit={() => void save()}
    open={open}
    title={<DialogTitle>{binding ? t('keys.dialog.editTitle') : t('keys.dialog.createTitle')}</DialogTitle>}
  >
    <Field
      hint={binding ? undefined : t('keys.dialog.keyHint')}
      label={t('keys.list.key')}
      validationMessage={submitted && keyError ? keyError : undefined}
      validationState={submitted && keyError ? 'error' : undefined}
    >
      <div className="flex gap-2">
        <Input className="grow font-mono" onChange={(_, data) => setKey(data.value.trim())} readOnly={binding !== null} value={key} />
        {!binding && <Button onClick={() => setKey(generateKey())}>{t('keys.dialog.generate')}</Button>}
      </div>
    </Field>
    <Field label={t('keys.list.name')}>
      <Input onChange={(_, data) => setName(data.value)} placeholder={t('keys.dialog.namePlaceholder')} value={name} />
    </Field>
    <Field label={t('keys.dialog.mode')}>
      <ChoiceGroup
        ariaLabel={t('keys.dialog.mode')}
        items={[{ value: 'replay', label: t('keys.mode.replay') }, { value: 'record', label: t('keys.mode.record') }]}
        onChange={value => setMode(value as Mode)}
        value={mode}
      />
    </Field>
    {mode === 'record'
      ? <Field label={t('keys.dialog.target')} validationMessage={submitted && bindingError ? bindingError : undefined} validationState={submitted && bindingError ? 'error' : undefined}>
          <Dropdown onOptionSelect={(_, data) => setTarget(data.optionValue ?? '')} placeholder={t('keys.dialog.pickTarget')} selectedOptions={target ? [target] : []} value={target}>
            {targets.map(item => <Option key={item.id} value={item.id}>{item.id}</Option>)}
          </Dropdown>
        </Field>
      : <Field label={t('keys.dialog.scenario')} validationMessage={submitted && bindingError ? bindingError : undefined} validationState={submitted && bindingError ? 'error' : undefined}>
          <Dropdown onOptionSelect={(_, data) => setScenario(data.optionValue ?? '')} placeholder={t('keys.dialog.pickScenario')} selectedOptions={scenario ? [scenario] : []} value={scenario}>
            {scenarios.map(item => <Option key={item.name} value={item.name}>{item.name}</Option>)}
          </Dropdown>
        </Field>}
    {error && <OutcomeMessageBar onDismiss={() => setError(null)} title={t('keys.dialog.saveFailed')}>{error}</OutcomeMessageBar>}
  </DialogShell>;
}
