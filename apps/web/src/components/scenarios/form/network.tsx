import { NumberField } from './fields.tsx';
import type { NetworkForm } from './model.ts';
import { useTranslation } from '../../../i18n/translation.ts';
import { Switch } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Text } = fluentComponents;

const GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3';

// Fragmentation and stalls are present or absent as a whole; a switched-on
// one starts with the fields the server requires.
const FRAGMENTATION_START = { maxBytes: 16 } as const;
const STALLS_START = { probability: 0.05, durationMs: [1000, 5000] as [number, number] } as const;

// What the link between FlowMock and the client does to the bytes.
export function NetworkSection({ onChange, value }: {
  onChange: (value: NetworkForm) => void;
  value: NetworkForm | undefined;
}) {
  const { t } = useTranslation();
  const network = value ?? {};
  const set = <K extends keyof NetworkForm>(key: K, next: NetworkForm[K]) => onChange({ ...network, [key]: next });
  const stallDuration = network.stalls?.durationMs;
  return <div className="grid gap-4">
    <div className={GRID_CLASS}>
      <NumberField hint={t('scenarios.form.network.latencyHint')} label={t('scenarios.form.network.latency')} onChange={next => set('latencyMs', next)} placeholder="0" value={network.latencyMs} />
      <NumberField hint={t('scenarios.form.network.headersDelayHint')} label={t('scenarios.form.network.headersDelay')} onChange={next => set('headersDelayMs', next)} placeholder="0" value={network.headersDelayMs} />
      <NumberField hint={t('scenarios.form.network.jitterHint')} label={t('scenarios.form.network.jitter')} onChange={next => set('jitterMs', next)} placeholder="0" value={network.jitterMs} />
      <NumberField hint={t('scenarios.form.network.bandwidthHint')} label={t('scenarios.form.network.bandwidth')} onChange={next => set('bandwidthKBps', next)} placeholder={t('scenarios.form.network.unlimited')} value={network.bandwidthKBps} />
    </div>

    <div className="grid gap-2">
      <Switch
        checked={network.fragmentation !== undefined}
        label={t('scenarios.form.network.fragmentation')}
        onChange={(_, data) => set('fragmentation', data.checked ? { ...FRAGMENTATION_START } : undefined)}
      />
      <Text className="text-fui-fg2" size={200}>{t('scenarios.form.network.fragmentationHint')}</Text>
      {network.fragmentation && <div className={GRID_CLASS}>
        <NumberField label={t('scenarios.form.network.maxBytes')} onChange={next => set('fragmentation', { ...network.fragmentation, maxBytes: next })} value={network.fragmentation.maxBytes} />
        <NumberField label={t('scenarios.form.network.minBytes')} onChange={next => set('fragmentation', { ...network.fragmentation, minBytes: next })} placeholder="1" value={network.fragmentation.minBytes} />
        <NumberField label={t('scenarios.form.network.gap')} onChange={next => set('fragmentation', { ...network.fragmentation, gapMs: next })} placeholder="1" value={network.fragmentation.gapMs} />
      </div>}
    </div>

    <div className="grid gap-2">
      <Switch
        checked={network.stalls !== undefined}
        label={t('scenarios.form.network.stalls')}
        onChange={(_, data) => set('stalls', data.checked ? { ...STALLS_START, durationMs: [...STALLS_START.durationMs] } : undefined)}
      />
      <Text className="text-fui-fg2" size={200}>{t('scenarios.form.network.stallsHint')}</Text>
      {network.stalls && <div className={GRID_CLASS}>
        <NumberField label={t('scenarios.form.network.stallProbability')} onChange={next => set('stalls', { ...network.stalls, probability: next })} value={network.stalls.probability} />
        <NumberField label={t('scenarios.form.network.stallMin')} onChange={next => set('stalls', { ...network.stalls, durationMs: [next ?? 0, stallDuration?.[1] ?? 0] })} value={stallDuration?.[0]} />
        <NumberField label={t('scenarios.form.network.stallMax')} onChange={next => set('stalls', { ...network.stalls, durationMs: [stallDuration?.[0] ?? 0, next ?? 0] })} value={stallDuration?.[1]} />
      </div>}
    </div>
  </div>;
}
