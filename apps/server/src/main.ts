import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { applyConfigFile, loadConfigFile, runtimeConfig } from './config-file.ts';
import { startServer } from './server.ts';
import { FLOWMOCK_VERSION } from './version.ts';

const USAGE = `FlowMock ${FLOWMOCK_VERSION} — an LLM API simulator with tunable timing and faults

Usage: flowmock [options]

Options:
  --host <host>       Interface to listen on (env FLOWMOCK_HOST, default 127.0.0.1)
  --port <port>       Port to listen on (env FLOWMOCK_PORT, default 8787)
  --data <dir>        Database and recorded chunks (env FLOWMOCK_DATA_DIR, default ./data)
  --config <file>     flowmock.yaml with targets, keys and scenarios (env FLOWMOCK_CONFIG)
  -h, --help          Show this help

The admin API under /api requires Authorization: Bearer $FLOWMOCK_ADMIN_KEY when
that variable is set; without it FlowMock only listens on loopback addresses.`;

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string' },
    data: { type: 'string' },
    config: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const env = process.env;
const configPath = values.config ?? env.FLOWMOCK_CONFIG;
// A broken config fails before anything listens.
const config = configPath === undefined ? null : loadConfigFile(resolve(configPath));
const runtime = runtimeConfig(config, env);
const running = await startServer({
  ...runtime,
  host: values.host ?? env.FLOWMOCK_HOST ?? '127.0.0.1',
  port: Number(values.port ?? env.FLOWMOCK_PORT ?? 8787),
  dataDir: resolve(values.data ?? env.FLOWMOCK_DATA_DIR ?? 'data'),
  adminKey: env.FLOWMOCK_ADMIN_KEY ?? null,
});

if (config !== null) {
  const applied = await applyConfigFile(running.services, config);
  console.log(`[flowmock] applied ${configPath}: ${applied.targets} target(s), ${applied.scenarios} scenario(s), ${applied.keys} key(s), ${applied.recordings} imported recording(s)`);
}

console.log(`[flowmock] ${FLOWMOCK_VERSION} listening on ${running.url}`);
console.log(`[flowmock] data plane: ${running.url}/v1 (OpenAI, Anthropic), ${running.url}/v1beta (Gemini); admin API: ${running.url}/api`);

let stopping = false;
const shutdown = (signal: string) => {
  if (stopping) process.exit(1);
  stopping = true;
  console.log(`[flowmock] ${signal}, shutting down`);
  running.close({ graceMs: runtime.shutdownGraceMs }).then(() => process.exit(0), error => {
    console.error(error);
    process.exit(1);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
