import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyConfigFile, expandEnv, loadConfigFile, runtimeConfig } from '../src/config-file.ts';
import { startTestServer, type TestServer } from './support/flowmock.ts';

let dir: string;
let flowmock: TestServer;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flowmock-config-'));
  flowmock = await startTestServer();
});

afterAll(async () => {
  await flowmock.stop();
  await rm(dir, { recursive: true, force: true });
});

describe('flowmock.yaml', () => {
  it('loads timeline settings and lets environment settings override them', async () => {
    const path = join(dir, 'runtime.yaml');
    await writeFile(path, 'timeline: { persist: true, retainDays: 2, maxEntries: 10 }\n');
    const config = loadConfigFile(path, {});
    expect(runtimeConfig(config, {}).timeline).toEqual({ persist: true, retainDays: 2, maxEntries: 10 });
    expect(runtimeConfig(config, { FLOWMOCK_TIMELINE_PERSIST: '0', FLOWMOCK_TIMELINE_RETAIN_DAYS: '3', FLOWMOCK_TIMELINE_MAX: '12' }).timeline).toEqual({ persist: false, retainDays: 3, maxEntries: 12 });
    expect(() => runtimeConfig(config, { FLOWMOCK_TIMELINE_MAX: 'NaN' })).toThrow();
    expect(() => runtimeConfig(config, { FLOWMOCK_TIMELINE_PERSIST: 'yes' })).toThrow();
    expect(runtimeConfig(config, { FLOWMOCK_SHUTDOWN_GRACE_MS: '50' }).shutdownGraceMs).toBe(50);
    expect(() => runtimeConfig(config, { FLOWMOCK_SHUTDOWN_GRACE_MS: '-1' })).toThrow();
  });
  it('expands environment variables and refuses unset ones', () => {
    expect(expandEnv('key: ${SECRET}', { SECRET: 'sk-1' })).toBe('key: sk-1');
    expect(() => expandEnv('key: ${MISSING}', {})).toThrow(/MISSING/);
  });

  it('applies targets, scenario files and keys', async () => {
    await mkdir(join(dir, 'scenarios'));
    await writeFile(join(dir, 'scenarios', 'slow.yaml'), '# Three times slower.\nname: slow\ntiming: { mode: recorded, scale: 3 }\n');
    await writeFile(join(dir, 'scenarios', 'seeded.yaml'), '# Seeded from the environment.\nname: seeded\nseed: "${SCENARIO_SEED}"\n');
    await writeFile(join(dir, 'flowmock.yaml'), [
      'targets:',
      '  - id: anthropic',
      '    baseUrl: https://api.anthropic.com',
      '    headers: { x-api-key: "${UPSTREAM_KEY}" }',
      'scenarioDir: scenarios',
      'scenarios:',
      '  - name: inline',
      '    faults: [{ inject: { type: interrupt, mode: reset } }]',
      '# A commented-out example may name variables that are not set: ${NOT_SET}',
      'keys:',
      '  - { key: fm-record-anthropic, record: anthropic }',
      '  - { key: fm-replay-slow, replay: slow }',
      '',
    ].join('\n'));
    const config = loadConfigFile(join(dir, 'flowmock.yaml'), { UPSTREAM_KEY: 'sk-ant-xyz', SCENARIO_SEED: 'seed-7' });
    expect(await applyConfigFile(flowmock.services, config)).toEqual({ targets: 1, scenarios: 3, keys: 2, recordings: 0 });
    expect(flowmock.services.config.getTarget('anthropic')?.headers).toEqual({ 'x-api-key': 'sk-ant-xyz' });
    expect(flowmock.services.config.getScenario('slow')?.scenario.timing).toEqual({ mode: 'recorded', scale: 3 });
    // A scenario file is stored as written, comments and all, unless it names
    // environment variables, whose values it is stored with instead.
    expect(flowmock.services.config.getScenario('slow')?.source).toBe('# Three times slower.\nname: slow\ntiming: { mode: recorded, scale: 3 }\n');
    expect(flowmock.services.config.getScenario('seeded')?.scenario.seed).toBe('seed-7');
    expect(flowmock.services.config.getScenario('seeded')?.source).not.toContain('SCENARIO_SEED');
    expect(flowmock.services.config.getKey('fm-replay-slow')).toMatchObject({ mode: 'replay', scenario: 'slow' });
  });
});
