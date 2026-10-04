import { z } from 'zod';

import { applyInterrupt } from './faults.ts';
import { applyNetwork } from './network.ts';
import { applyRewrite } from './rewrite.ts';
import { applyTiming } from './timing.ts';
import type { ReplayDraft, ReplayPlan } from '../plan/types.ts';
import type { ProtocolAdapter } from '../protocols/adapter.ts';
import type { Rng } from '../random.ts';
import { interruptFaultSchema, networkSchema, rewriteSchema, timingSchema } from '../scenario/schema.ts';

export interface TransformContext {
  adapter: ProtocolAdapter;
  rng: Rng;
  requestModel: string | null;
  // Unix seconds.
  nowSeconds: number;
}

// Frame stages run in this order on the draft; `network` runs on the encoded
// plan's writes.
export const TRANSFORM_STAGES = ['content', 'timing', 'fault', 'network'] as const;

export type TransformStage = (typeof TRANSFORM_STAGES)[number];

export interface DraftTransform<Config> {
  type: string;
  stage: Exclude<TransformStage, 'network'>;
  description: string;
  schema: z.ZodType<Config>;
  apply(draft: ReplayDraft, config: Config, context: TransformContext): void;
}

export interface PlanTransform<Config> {
  type: string;
  stage: 'network';
  description: string;
  schema: z.ZodType<Config>;
  // Returns provenance notes.
  apply(plan: ReplayPlan, config: Config, context: TransformContext): string[];
}

export type TransformDefinition<Config = unknown> = DraftTransform<Config> | PlanTransform<Config>;

const registry = new Map<string, TransformDefinition<never>>();

export const registerTransform = <Config>(definition: TransformDefinition<Config>): void => {
  if (registry.has(definition.type)) throw new Error(`Transform type ${definition.type} is already registered`);
  registry.set(definition.type, definition as unknown as TransformDefinition<never>);
};

export const transformDefinition = (type: string): TransformDefinition<unknown> | undefined =>
  registry.get(type) as TransformDefinition<unknown> | undefined;

export const listTransforms = (): ReadonlyArray<TransformDefinition<unknown>> => [...registry.values()] as TransformDefinition<unknown>[];

export interface CompiledTransform {
  definition: TransformDefinition<unknown>;
  config: unknown;
}

export class TransformConfigError extends Error {}

// Validates a scenario's extra `transforms` entries against their registered
// schemas.
export const compileTransforms = (entries: ReadonlyArray<{ type: string } & Record<string, unknown>>): CompiledTransform[] =>
  entries.map((entry, index) => {
    const definition = transformDefinition(entry.type);
    if (!definition) throw new TransformConfigError(`transforms[${index}]: unknown transform type "${entry.type}" (registered: ${[...registry.keys()].join(', ')})`);
    const { type: _type, ...config } = entry;
    const parsed = definition.schema.safeParse(config);
    if (!parsed.success) throw new TransformConfigError(`transforms[${index}] (${entry.type}): ${z.prettifyError(parsed.error)}`, { cause: parsed.error });
    return { definition, config: parsed.data };
  });

registerTransform({
  type: 'rewrite',
  stage: 'content',
  description: 'Consistently rewrites response identifiers, the model name and timestamps.',
  schema: rewriteSchema,
  apply: (draft, config, context) => applyRewrite(draft, config, context),
});

registerTransform({
  type: 'timing',
  stage: 'timing',
  description: 'Schedules frames from recorded intervals or a sampled TTFT and decode speed.',
  schema: timingSchema,
  apply: (draft, config, context) => applyTiming(draft, config, context.rng),
});

const interruptSchema = interruptFaultSchema.omit({ type: true });

registerTransform({
  type: 'interrupt',
  stage: 'fault',
  description: 'Cuts the response at a position and ends it with fin, abort, reset, hang or a WebSocket close.',
  schema: interruptSchema,
  apply: (draft, config, _context) => applyInterrupt(draft, { type: 'interrupt', ...config }),
});

registerTransform({
  type: 'network',
  stage: 'network',
  description: 'Shapes writes with latency, jitter, bandwidth, fragmentation and stalls.',
  schema: networkSchema,
  apply: (plan, config, context) => applyNetwork(plan, config, context.rng),
});
