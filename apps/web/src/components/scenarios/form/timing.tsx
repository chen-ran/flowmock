import { DistributionField, NumberField } from './fields.tsx';
import type { TimingForm } from './model.ts';
import { useTranslation } from '../../../i18n/translation.ts';
import { ChoiceGroup } from '@flowmock/ui/controls/choice-group.tsx';
import { TWO_COLUMN_FORM_CLASS } from '@flowmock/ui/controls/layout.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Field } = fluentComponents;

// Synthetic timing needs both distributions; these start a switched scenario
// at a typical hosted model's pace, for the reader to adjust.
const SYNTHETIC_START = { ttftMs: 600, tps: 60 } as const;

// When frames are written: at their recorded times, scaled, or on a schedule
// drawn from a time to first token and a decode speed.
export function TimingSection({ onChange, value }: {
  onChange: (value: TimingForm) => void;
  value: TimingForm | undefined;
}) {
  const { t } = useTranslation();
  const timing = value ?? { mode: 'recorded' };
  return <div className="grid gap-3">
    <Field label={t('scenarios.form.timing.mode')}>
      <ChoiceGroup
        ariaLabel={t('scenarios.form.timing.mode')}
        items={[
          { value: 'recorded', label: t('scenarios.form.timing.modes.recorded') },
          { value: 'synthetic', label: t('scenarios.form.timing.modes.synthetic') },
        ]}
        onChange={mode => {
          if (mode === timing.mode) return;
          onChange(mode === 'recorded' ? { mode: 'recorded' } : { mode: 'synthetic', ...SYNTHETIC_START });
        }}
        value={timing.mode}
      />
    </Field>
    {timing.mode === 'recorded'
      ? <div className={`${TWO_COLUMN_FORM_CLASS} gap-3`}>
          <NumberField
            hint={t('scenarios.form.timing.scaleHint')}
            label={t('scenarios.form.timing.scale')}
            onChange={scale => onChange({ ...timing, scale })}
            placeholder="1"
            value={timing.scale}
          />
        </div>
      : <>
          <div className={`${TWO_COLUMN_FORM_CLASS} gap-x-6 gap-y-3`}>
            <DistributionField label={t('scenarios.form.timing.ttft')} onChange={ttftMs => onChange({ ...timing, ttftMs })} unit="ms" value={timing.ttftMs} />
            <DistributionField label={t('scenarios.form.timing.tps')} onChange={tps => onChange({ ...timing, tps })} unit={t('scenarios.form.units.tps')} value={timing.tps} />
          </div>
          <div className={`${TWO_COLUMN_FORM_CLASS} gap-3`}>
            <NumberField
              hint={t('scenarios.form.timing.jitterHint')}
              label={t('scenarios.form.timing.jitter')}
              onChange={jitterMs => onChange({ ...timing, jitterMs })}
              placeholder="0"
              value={timing.jitterMs}
            />
          </div>
        </>}
  </div>;
}
