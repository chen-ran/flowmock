import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO, parseScenario, scenarioSchema } from '../../src/index.ts';

describe('scenarioSchema', () => {
  it('accepts the documented weak-network-429 example', () => {
    const scenario = parseScenario({
      name: 'weak-network-429',
      selection: { mode: 'match-then-sample', onMiss: 'sample', sample: { outcome: 'ok', seed: 42 } },
      timing: { mode: 'synthetic', ttftMs: { dist: 'lognormal', p50: 800, p95: 3000 }, tps: { dist: 'normal', mean: 60, sd: 10 } },
      network: { latencyMs: 80, jitterMs: 40, bandwidthKBps: 32, fragmentation: { maxBytes: 7 }, stalls: { probability: 0.02, durationMs: [2000, 20000] } },
      faults: [
        { when: { callIndex: 3 }, inject: { type: 'http_error', from: { outcome: 'http_error:429' }, headers: { 'retry-after': '2' } } },
        { when: { probability: 0.05 }, inject: { type: 'interrupt', at: { fraction: 0.4 }, mode: 'reset' } },
      ],
    });
    expect(scenario.network.fragmentation).toEqual({ maxBytes: 7, minBytes: 1, gapMs: 1 });
    expect(scenario.faults[1].inject).toMatchObject({ type: 'interrupt', mode: 'reset', hangMs: 600_000 });
  });

  it('fills every default for a bare name', () => {
    expect(DEFAULT_SCENARIO).toMatchObject({
      fidelity: 'normal',
      selection: { mode: 'match-then-sample', onMiss: 'error', prefix: true, minPrefix: 2, outcomes: ['ok'], onEnd: 'error' },
      rewrite: { ids: true, model: 'auto', created: true },
      timing: { mode: 'recorded', scale: 1 },
      network: { latencyMs: 0, jitterMs: 0, headersDelayMs: 0 },
      faults: [],
    });
  });

  it.each([
    [{ name: 'x', timing: { mode: 'synthetic', ttftMs: 100 } }, 'tps'],
    [{ name: 'x', faults: [{ inject: { type: 'interrupt', at: { fraction: 0.2, frame: 3 } } }] }, 'position takes one of'],
    [{ name: 'x', faults: [{ inject: { type: 'explode' } }] }, 'type'],
    [{ name: 'x', selection: { mode: 'sometimes' } }, 'mode'],
    [{ name: 'has space' }, 'name'],
    [{ name: 'x', timing: { mode: 'synthetic', ttftMs: { dist: 'lognormal', p50: 900, p95: 100 }, tps: 10 } }, 'p95'],
    [{ name: 'x', unknown: true }, 'unknown'],
  ])('rejects invalid configuration %#', (input, message) => {
    const result = scenarioSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(message);
  });
});
