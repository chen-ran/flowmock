import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import chaos from '../../../../../examples/scenarios/chaos.yaml?raw';
import weakNetwork from '../../../../../examples/scenarios/weak-network-429.yaml?raw';
import { applyForm, callIndexText, parseCallIndex, scenarioToForm, type ScenarioForm } from '../../../src/components/scenarios/form/model.ts';

const formOf = (source: string): ScenarioForm => {
  const parsed = scenarioToForm(source);
  if (parsed.form === null) throw new Error(parsed.error);
  return parsed.form;
};

const changedLines = (before: string, after: string) => {
  const a = before.split('\n');
  const b = after.split('\n');
  return b.flatMap((line, index) => (line === a[index] ? [] : [[a[index], line]]));
};

describe('the scenario form model', () => {
  it('writes an untouched form back byte for byte', () => {
    for (const source of [weakNetwork, chaos]) expect(applyForm(source, formOf(source))).toBe(source);
  });

  it('changes one value on its own line and nowhere else', () => {
    const form = formOf(weakNetwork);
    const timing = form.timing as Extract<ScenarioForm['timing'], { mode: 'synthetic' }>;
    const next = applyForm(weakNetwork, { ...form, timing: { ...timing, tps: { dist: 'normal', mean: 75, sd: 10 } } });
    expect(changedLines(weakNetwork, next)).toEqual([['  tps: { dist: normal, mean: 60, sd: 10 }', '  tps: { dist: normal, mean: 75, sd: 10 }']]);
    expect(next.startsWith('# Lognormal time to first token')).toBe(true);
  });

  it('keeps comments and fields the form does not cover through a change of shape', () => {
    const source = `# Hand-written.
name: shaped
timing: { mode: synthetic, ttftMs: 800, tps: 40 }
transforms:
  - type: truncate_tokens # kept as written
    max: 12
`;
    const form = formOf(source);
    const next = applyForm(source, { ...form, timing: { mode: 'synthetic', ttftMs: { dist: 'lognormal', p50: 800, p95: 3000 }, tps: 40 }, network: { latencyMs: 80 } });
    expect(parse(next)).toEqual({
      name: 'shaped',
      timing: { mode: 'synthetic', ttftMs: { dist: 'lognormal', p50: 800, p95: 3000 }, tps: 40 },
      transforms: [{ type: 'truncate_tokens', max: 12 }],
      network: { latencyMs: 80 },
    });
    expect(next).toContain('# Hand-written.');
    expect(next).toContain('# kept as written');
  });

  it('switches the timing mode without leaving the other mode\'s fields behind', () => {
    const next = applyForm(weakNetwork, { ...formOf(weakNetwork), timing: { mode: 'recorded', scale: 0.5 } });
    expect(parse(next).timing).toEqual({ mode: 'recorded', scale: 0.5 });
    expect(parse(next).network).toEqual(parse(weakNetwork).network);
  });

  it('adds and removes fault rules', () => {
    const form = formOf(chaos);
    const fewer = applyForm(chaos, { ...form, faults: form.faults!.slice(1) });
    expect(parse(fewer).faults).toEqual(parse(chaos).faults.slice(1));
    const more = applyForm(chaos, { ...form, faults: [...form.faults!, { when: { callIndex: 2 }, inject: { type: 'http_error', status: 429 } }] });
    expect(parse(more).faults.at(-1)).toEqual({ when: { callIndex: 2 }, inject: { type: 'http_error', status: 429 } });
    expect(more).toContain('# Every failure mode in rotation');
  });

  it('has no form for a source that is not YAML', () => {
    expect(scenarioToForm('name: x\ntiming: { mode: [').form).toBeNull();
  });

  it('re-lays only the section whose shape changed', () => {
    const next = applyForm(weakNetwork, { ...formOf(weakNetwork), timing: { mode: 'recorded', scale: 2 } });
    expect(next).toBe(weakNetwork.replace(
      'timing:\n  mode: synthetic\n  ttftMs: { dist: lognormal, p50: 800, p95: 3000 }\n  tps: { dist: normal, mean: 60, sd: 10 }\n',
      'timing:\n  mode: recorded\n  scale: 2\n',
    ));
  });

  it('adds and removes a rule without re-laying the rules it keeps', () => {
    const form = formOf(weakNetwork);
    const added = applyForm(weakNetwork, { ...form, faults: [...form.faults!, { when: { everyN: 5 }, inject: { type: 'interrupt', mode: 'fin' } }] });
    expect(added).toBe(`${weakNetwork}  - when: { everyN: 5 }\n    inject: { type: interrupt, mode: fin }\n`);
    const removed = applyForm(weakNetwork, { ...form, faults: form.faults!.slice(1) });
    expect(removed).toBe(weakNetwork.replace('  - when: { callIndex: 3 }\n    inject: { type: http_error, from: { outcome: "http_error:429" }, headers: { retry-after: "2" } }\n', ''));
  });

  it('writes a collection the form adds on one line', () => {
    const next = applyForm('name: x\nnetwork:\n  latencyMs: 80\n', { name: 'x', network: { latencyMs: 80, stalls: { probability: 0.05, durationMs: [1000, 5000] } } });
    expect(next).toBe('name: x\nnetwork:\n  latencyMs: 80\n  stalls: { probability: 0.05, durationMs: [1000, 5000] }\n');
  });

  it('leaves out a field the form clears', () => {
    const form = formOf(weakNetwork);
    const next = applyForm(weakNetwork, { ...form, network: { ...form.network, bandwidthKBps: undefined } });
    expect(parse(next).network).not.toHaveProperty('bandwidthKBps');
    expect(next).toBe(weakNetwork.replace('  bandwidthKBps: 32\n', ''));
  });
});

describe('call numbers', () => {
  it('reads one call, a list or a range', () => {
    expect(parseCallIndex('3')).toBe(3);
    expect(parseCallIndex('1, 4,7')).toEqual([1, 4, 7]);
    expect(parseCallIndex('2-5')).toEqual({ from: 2, to: 5 });
    expect(parseCallIndex('5-')).toEqual({ from: 5 });
    expect(parseCallIndex(' - 5')).toEqual({ to: 5 });
    expect(parseCallIndex('')).toBeUndefined();
  });

  it('refuses what is not call numbers', () => {
    for (const text of ['0', 'x', '1,,2', '-', '1.5', '3-2-1']) expect(parseCallIndex(text), text).toBeNull();
  });

  it('writes back what it reads', () => {
    for (const text of ['3', '1, 4, 7', '2-5', '5-', '-5']) expect(callIndexText(parseCallIndex(text) ?? undefined)).toBe(text);
  });
});
