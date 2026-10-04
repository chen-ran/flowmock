import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const bin = fileURLToPath(new URL('../bin/flowmock.js', import.meta.url));

// Runs the launcher the way `pnpm start -- …` does: from the package
// directory, with the invoking directory in INIT_CWD and a literal `--`.
const launch = (args: string[]) => spawn(process.execPath, [bin, '--', ...args], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, INIT_CWD: repoRoot },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let dataDir: string;
beforeAll(async () => { dataDir = await mkdtemp(join(tmpdir(), 'flowmock-cli-')); });
afterAll(async () => { await rm(dataDir, { recursive: true, force: true }); });

describe('flowmock launcher', () => {
  it('accepts the pnpm argument separator', async () => {
    const child = launch(['--help']);
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    const code = await new Promise<number | null>(resolve => child.on('exit', resolve));
    expect(code).toBe(0);
    expect(output).toContain('Usage: flowmock [options]');
  });

  it('resolves --config from the invoking directory and serves the example corpus', async () => {
    const child = launch(['--config', 'examples/flowmock.yaml', '--port', '0', '--data', dataDir]);
    let output = '';
    const url = await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        const match = /listening on (http:\/\/\S+)/.exec(output);
        if (match) resolve(match[1]);
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('exit', code => reject(new Error(`exited ${code}: ${output}`)));
    });
    try {
      expect(output).toContain('19 imported recording(s)');
      expect(output).not.toContain('ExperimentalWarning');
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer fm-demo-replay' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hello!' }] }),
      });
      expect(await response.json()).toMatchObject({ choices: [{ message: { content: 'Hello! How can I help?' } }] });
    } finally {
      const exited = new Promise(resolve => child.on('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  });
});
