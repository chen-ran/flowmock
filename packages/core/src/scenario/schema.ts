import { z } from 'zod';

import { distributionSchema } from '../distribution.ts';
import { PROTOCOLS } from '@flowmock/protocols/common';

const nonNegative = z.number().nonnegative();
const probability = z.number().min(0).max(1);
const seedSchema = z.union([z.number(), z.string()]);

// ── Selection ──

export const sampleFilterSchema = z.object({
  // Outcome glob such as `ok` or `http_error:*`.
  outcome: z.string().optional(),
  // Requested model -> recorded model globs. `*` keys act as a fallback.
  models: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  // Treat model, tool and reasoning affinity as hard filters instead of
  // preferences.
  strict: z.boolean().default(false),
  seed: seedSchema.optional(),
}).strict();

export const selectionSchema = z.object({
  mode: z.enum(['match', 'sequence', 'sample', 'match-then-sample']).default('match-then-sample'),
  // What a `match` miss does. `match-then-sample` always samples.
  onMiss: z.enum(['error', 'sample']).default('error'),
  // Fall back to the recording sharing the longest conversation prefix.
  prefix: z.boolean().default(true),
  // Shortest shared prefix, in segments (header + turns), a prefix match
  // accepts. The default 2 requires the header and first turn to agree.
  minPrefix: z.number().int().min(1).default(2),
  // Outcomes `match` and `sample` may return.
  outcomes: z.array(z.string()).default(['ok']),
  // `sequence` mode: the cassette to walk.
  cassette: z.string().optional(),
  // `sequence` mode: what happens after the last recording.
  onEnd: z.enum(['error', 'loop', 'last', 'sample']).default('error'),
  sample: sampleFilterSchema.default({ strict: false }),
}).strict();

// ── Timing ──

export const timingSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('recorded'),
    // Multiplies every recorded interval.
    scale: z.number().positive().default(1),
  }).strict(),
  z.object({
    mode: z.literal('synthetic'),
    ttftMs: distributionSchema,
    tps: distributionSchema,
    // Standard deviation of per-frame noise, in milliseconds.
    jitterMs: nonNegative.default(0),
  }).strict(),
]);

// ── Network ──

export const networkSchema = z.object({
  // Added before the status line and every write.
  latencyMs: nonNegative.default(0),
  // Extra delay of the status line alone.
  headersDelayMs: nonNegative.default(0),
  // Uniform extra delay per write.
  jitterMs: nonNegative.default(0),
  bandwidthKBps: z.number().positive().optional(),
  // Splits every write at random byte offsets, including inside UTF-8
  // sequences and SSE lines.
  fragmentation: z.object({
    maxBytes: z.number().int().positive(),
    minBytes: z.number().int().positive().default(1),
    gapMs: nonNegative.default(1),
  }).strict().optional(),
  // Silent pauses before a write. No keep-alive is inserted.
  stalls: z.object({
    probability,
    durationMs: z.tuple([nonNegative, nonNegative]),
  }).strict().optional(),
}).strict();

// ── Faults ──

export const triggerSchema = z.object({
  // 1-based call number inside the session: one value, a list, or a range.
  callIndex: z.union([
    z.number().int().positive(),
    z.array(z.number().int().positive()),
    z.object({ from: z.number().int().positive().optional(), to: z.number().int().positive().optional() }).strict(),
  ]).optional(),
  everyN: z.number().int().positive().optional(),
  probability: probability.optional(),
  // Active between startMs and endMs after the scenario's epoch, repeating
  // every periodMs when given.
  window: z.object({ startMs: nonNegative, endMs: nonNegative, periodMs: z.number().positive().optional() }).strict().optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
  hasTools: z.boolean().optional(),
  protocol: z.enum(PROTOCOLS).optional(),
}).strict();

export const positionSchema = z.object({
  // Share of output tokens delivered before the fault.
  fraction: probability.optional(),
  // Index of the frame the fault lands before.
  frame: z.number().int().nonnegative().optional(),
  // Milliseconds after the request arrived.
  afterMs: nonNegative.optional(),
}).strict().refine(value => [value.fraction, value.frame, value.afterMs].filter(v => v !== undefined).length <= 1, {
  message: 'position takes one of fraction, frame or afterMs',
});

const recordedErrorSource = z.object({
  outcome: z.string().optional(),
  model: z.string().optional(),
  recording: z.string().optional(),
}).strict();

const httpErrorOverrides = {
  from: recordedErrorSource.optional(),
  status: z.number().int().min(400).max(599).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  // A string is sent verbatim; anything else as JSON.
  body: z.unknown().optional(),
  // Response delay; defaults to the sample's recorded time to headers.
  delayMs: nonNegative.optional(),
};

export const interruptFaultSchema = z.object({
  type: z.literal('interrupt'),
  at: positionSchema.default({ fraction: 0.5 }),
  // `fin` ends the HTTP response cleanly but early, `abort` closes the
  // connection mid-body, `reset` sends a TCP RST, `hang` stops writing.
  mode: z.enum(['fin', 'abort', 'reset', 'hang', 'ws_close', 'ws_terminate']).default('reset'),
  // `ws_close` close code and reason.
  code: z.number().int().min(1000).max(4999).default(1011),
  reason: z.string().default(''),
  // `hang`: how long to hold the connection before dropping it.
  hangMs: nonNegative.default(600_000),
}).strict();

export const faultSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('http_error'), ...httpErrorOverrides }).strict(),
  z.object({
    type: z.literal('stream_error_event'),
    from: recordedErrorSource.optional(),
    // Inline event payload, used instead of a recorded sample.
    event: z.unknown().optional(),
    at: positionSchema.default({ fraction: 0.5 }),
  }).strict(),
  interruptFaultSchema,
  z.object({
    type: z.literal('concurrency_limit'),
    // Requests in flight per key above which the fault fires.
    max: z.number().int().nonnegative(),
    ...httpErrorOverrides,
  }).strict(),
]);

export const faultRuleSchema = z.object({
  when: triggerSchema.default({}),
  inject: faultSchema,
}).strict();

// ── Transforms ──

export const rewriteSchema = z.object({
  ids: z.boolean().default(true),
  // `auto` rewrites the response model only when the client asked for a
  // different model than the recording did.
  model: z.enum(['auto', 'always', 'never']).default('auto'),
  created: z.boolean().default(true),
}).strict();

// Additional registered transforms: `{ type, ...config }`. Each type's own
// schema validates its config when the scenario is compiled.
export const extraTransformSchema = z.object({ type: z.string() }).catchall(z.unknown());

// ── Scenario ──

export const scenarioSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'use letters, digits, dot, underscore or dash'),
  description: z.string().optional(),
  seed: seedSchema.optional(),
  // `raw` replays recorded bytes exactly, skipping content rewrites.
  fidelity: z.enum(['normal', 'raw']).default('normal'),
  selection: selectionSchema.default(() => selectionSchema.parse({})),
  rewrite: rewriteSchema.default(() => rewriteSchema.parse({})),
  timing: timingSchema.default({ mode: 'recorded', scale: 1 }),
  network: networkSchema.default(() => networkSchema.parse({})),
  faults: z.array(faultRuleSchema).default([]),
  transforms: z.array(extraTransformSchema).default([]),
}).strict();

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioInput = z.input<typeof scenarioSchema>;
export type Selection = z.infer<typeof selectionSchema>;
export type SampleFilter = z.infer<typeof sampleFilterSchema>;
export type Timing = z.infer<typeof timingSchema>;
export type Network = z.infer<typeof networkSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type Position = z.infer<typeof positionSchema>;
export type Fault = z.infer<typeof faultSchema>;
export type FaultRule = z.infer<typeof faultRuleSchema>;
export type RewriteOptions = z.infer<typeof rewriteSchema>;

export const parseScenario = (value: unknown): Scenario => scenarioSchema.parse(value);

// The scenario a key falls back to when nothing else is configured: exact or
// prefix match first, any successful recording of the protocol otherwise,
// recorded timing, no faults.
export const DEFAULT_SCENARIO: Scenario = parseScenario({ name: 'default' });
