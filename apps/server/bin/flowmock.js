#!/usr/bin/env node
// Runs the TypeScript entry through tsx so the workspace needs no build step.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsx = join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');

// `pnpm start -- --config x` hands the separator through to the script.
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

// node:sqlite still reports itself experimental on Node 22 and 24. tsx runs
// the entry in a child process, which inherits NODE_OPTIONS.
const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --disable-warning=ExperimentalWarning`.trim() };

// pnpm runs a script from its package directory and records where it was
// invoked in INIT_CWD; relative paths such as --config and the default ./data
// resolve from there, the way the user typed them.
const child = spawn(process.execPath, [tsx, entry, ...args], { stdio: 'inherit', env, cwd: process.env.INIT_CWD ?? process.cwd() });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
