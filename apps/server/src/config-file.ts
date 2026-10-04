import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { importCorpus } from './control/portable.ts';
import type { Services } from './services.ts';
import { keyInputSchema, targetInputSchema } from './store/config-store.ts';

// `flowmock.yaml`: targets, key bindings and scenarios applied at startup.
// `${NAME}` expands from the environment so upstream secrets stay out of the
// file.
const configFileSchema = z.object({
  targets: z.array(targetInputSchema).default([]),
  scenarios: z.array(z.record(z.string(), z.unknown())).default([]),
  // A directory of `*.yaml` scenario files, relative to the config file.
  scenarioDir: z.string().optional(),
  keys: z.array(keyInputSchema).default([]),
  // Portable corpus files (`/api/export` output) imported at startup,
  // relative to the config file. Imports keep ids, so restarts are no-ops.
  corpus: z.array(z.string()).default([]),
}).strict();

export type ConfigFile = z.infer<typeof configFileSchema>;

export const expandEnv = (text: string, env: NodeJS.ProcessEnv = process.env): string =>
  text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = env[name];
    if (value === undefined) throw new Error(`flowmock config references \${${name}}, which is not set`);
    return value;
  });

// Expands placeholders in parsed string values only, so a commented-out
// example in the file never needs its variables set.
const expandValues = (value: unknown, env: NodeJS.ProcessEnv): unknown => {
  if (typeof value === 'string') return expandEnv(value, env);
  if (Array.isArray(value)) return value.map(item => expandValues(item, env));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandValues(item, env)]));
  return value;
};

const readYaml = (path: string, env: NodeJS.ProcessEnv): unknown => expandValues(parseYaml(readFileSync(path, 'utf8')), env);

export const loadConfigFile = (path: string, env: NodeJS.ProcessEnv = process.env): ConfigFile => {
  const parsed = configFileSchema.safeParse(readYaml(path, env));
  if (!parsed.success) throw new Error(`invalid flowmock config ${path}: ${z.prettifyError(parsed.error)}`);
  const config = parsed.data;
  const relative = (target: string) => (isAbsolute(target) ? target : resolve(dirname(path), target));
  config.corpus = config.corpus.map(relative);
  if (config.scenarioDir !== undefined) {
    const dir = relative(config.scenarioDir);
    for (const file of readdirSync(dir).filter(name => /\.ya?ml$/.test(name)).sort()) {
      config.scenarios.push(readYaml(join(dir, file), env) as Record<string, unknown>);
    }
  }
  return config;
};

// Upserts everything the file declares. Entries created through the API and
// absent from the file are left alone.
export const applyConfigFile = async (services: Services, config: ConfigFile): Promise<{ targets: number; scenarios: number; keys: number; recordings: number }> => {
  for (const target of config.targets) services.config.upsertTarget(target);
  for (const scenario of config.scenarios) services.config.upsertScenario(stringifyYaml(scenario));
  for (const key of config.keys) services.config.upsertKey(key);
  let recordings = 0;
  for (const file of config.corpus) recordings += (await importCorpus(services, readFileSync(file, 'utf8'))).recordings;
  return { targets: config.targets.length, scenarios: config.scenarios.length, keys: config.keys.length, recordings };
};
