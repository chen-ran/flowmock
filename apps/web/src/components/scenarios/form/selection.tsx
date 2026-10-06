import type { ScenarioForm, SelectionMode } from './model.ts';
import type { CassetteSummary } from '../../../api/types.ts';
import { useTranslation } from '../../../i18n/translation.ts';
import { Dropdown } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { TWO_COLUMN_FORM_CLASS } from '@flowmock/ui/controls/layout.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Field, Option } = fluentComponents;

const MODES: readonly SelectionMode[] = ['match-then-sample', 'match', 'sequence', 'sample'];
const ON_END = ['error', 'loop', 'last', 'sample'] as const;

type Selection = NonNullable<ScenarioForm['selection']>;

// How a request finds the recording it replays. The finer matching and
// sampling options stay in the YAML.
export function SelectionSection({ cassettes, onChange, value }: {
  cassettes: readonly CassetteSummary[];
  onChange: (value: Selection) => void;
  value: Selection | undefined;
}) {
  const { t } = useTranslation();
  const mode = value?.mode ?? 'match-then-sample';
  const onEnd = typeof value?.onEnd === 'string' ? value.onEnd as typeof ON_END[number] : 'error';
  const cassette = cassettes.find(item => item.id === value?.cassette);
  return <div className="grid gap-3">
    <div className={`${TWO_COLUMN_FORM_CLASS} gap-3`}>
      <Field hint={t(`scenarios.form.selection.modeHints.${mode}`)} label={t('scenarios.form.selection.mode')}>
        <Dropdown
          onOptionSelect={(_, data) => onChange({ ...value, mode: data.optionValue as SelectionMode })}
          selectedOptions={[mode]}
          value={t(`scenarios.form.selection.modes.${mode}`)}
        >
          {MODES.map(option => <Option key={option} value={option}>{t(`scenarios.form.selection.modes.${option}`)}</Option>)}
        </Dropdown>
      </Field>
    </div>
    {mode === 'sequence' && <div className={`${TWO_COLUMN_FORM_CLASS} gap-3`}>
      <Field label={t('scenarios.form.selection.cassette')}>
        <Dropdown
          onOptionSelect={(_, data) => onChange({ ...value, cassette: data.optionValue })}
          placeholder={t('scenarios.form.selection.pickCassette')}
          selectedOptions={value?.cassette === undefined ? [] : [value.cassette]}
          value={cassette?.name ?? value?.cassette ?? ''}
        >
          {cassettes.map(item => <Option key={item.id} text={item.name} value={item.id}>{item.name}</Option>)}
        </Dropdown>
      </Field>
      <Field label={t('scenarios.form.selection.onEnd')}>
        <Dropdown
          onOptionSelect={(_, data) => onChange({ ...value, onEnd: data.optionValue })}
          selectedOptions={[onEnd]}
          value={t(`scenarios.form.selection.onEndModes.${onEnd}`)}
        >
          {ON_END.map(option => <Option key={option} value={option}>{t(`scenarios.form.selection.onEndModes.${option}`)}</Option>)}
        </Dropdown>
      </Field>
    </div>}
  </div>;
}
