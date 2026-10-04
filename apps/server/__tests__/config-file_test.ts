import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyConfigFile, expandEnv, loadConfigFile } from '../src/config-file.ts';
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
  it('expands environment variables and refuses unset ones', () => {
    expect(expandEnv('key: ${SECRET}', { SECRET: 'sk-1' })).toBe('key: sk-1');
    expect(() => expandEnv('key: ${MISSING}', {})).toThrow(/MISSING/);
  });

  it('applies targets, scenario files and keys', async () => {
    await mkdir(join(dir, 'scenarios'));
    await writeFile(join(dir, 'scenarios', 'slow.yaml'), 'name: slow\ntiming: { mode: recorded, scale: 3 }\n');
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
    const config = loadConfigFile(join(dir, 'flowmock.yaml'), { UPSTREAM_KEY: 'sk-ant-xyz' });
    expect(await applyConfigFile(flowmock.services, config)).toEqual({ targets: 1, scenarios: 2, keys: 2, recordings: 0 });
    expect(flowmock.services.config.getTarget('anthropic')?.headers).toEqual({ 'x-api-key': 'sk-ant-xyz' });
    expect(flowmock.services.config.getScenario('slow')?.scenario.timing).toEqual({ mode: 'recorded', scale: 3 });
    expect(flowmock.services.config.getKey('fm-replay-slow')).toMatchObject({ mode: 'replay', scenario: 'slow' });
  });
});
