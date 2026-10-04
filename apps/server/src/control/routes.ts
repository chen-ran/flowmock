import { Hono } from 'hono';
import { z } from 'zod';

import { adminAuth, type AdminEnv, authRoutes } from './auth.ts';
import { liveStream, requestStream } from './live.ts';
import { exportCorpus, importCorpus } from './portable.ts';
import { matchEndpoint } from '../data-plane/endpoints.ts';
import type { Services } from '../services.ts';
import { ConfigError, keyInputSchema, maskHeaders, type StoredScenario, type Target, targetInputSchema } from '../store/config-store.ts';
import { FLOWMOCK_VERSION } from '../version.ts';
import {
  adapterFor,
  decodeWireFrames,
  freshSeed,
  listTransforms,
  planReplay,
  prepareRequest,
  scenarioSchema,
} from '@flowmock/core';
import { PROTOCOLS } from '@flowmock/protocols/common';

const scenarioView = (stored: StoredScenario) => ({ name: stored.name, builtIn: stored.builtIn, source: stored.source, scenario: stored.scenario, createdAt: stored.createdAt, updatedAt: stored.updatedAt });

const targetView = (target: Target) => ({ ...target, headers: maskHeaders(target.headers) });

const parseJsonBody = async <T>(request: Request, schema: z.ZodType<T>): Promise<T> => {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ConfigError('request body must be JSON');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ConfigError(z.prettifyError(parsed.error));
  return parsed.data;
};

const previewSchema = z.object({
  protocol: z.enum(PROTOCOLS),
  // Request path; Gemini reads the model and streaming choice from it.
  path: z.string().optional(),
  body: z.unknown(),
  transport: z.enum(['http', 'ws']).default('http'),
  seed: z.string().optional(),
  callIndex: z.number().int().positive().default(1),
  session: z.string().optional(),
}).strict();

const cassettePatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  closed: z.boolean().optional(),
}).strict();

const MAX_PREVIEW_TEXT = 4096;

export const controlRoutes = (services: Services) => new Hono<AdminEnv>()
  .onError((error, c) => {
    if (error instanceof ConfigError) return c.json({ error: { code: 'invalid_request', message: error.message } }, error.status as 400);
    return c.json({ error: { code: 'internal_error', message: error.message, stack: error.stack } }, 500);
  })

  .get('/health', c => c.json({ ok: true, version: FLOWMOCK_VERSION }))
  .route('/auth', authRoutes(services))
  .use('*', adminAuth(services))

// ── Corpus ──

  .get('/recordings', c => {
    const query = c.req.query();
    const protocol = query.protocol === undefined ? undefined : z.enum(PROTOCOLS).parse(query.protocol);
    return c.json(services.corpus.list({
      protocol,
      model: query.model,
      outcome: query.outcome,
      cassetteId: query.cassette,
      sessionId: query.session,
      limit: query.limit === undefined ? undefined : Math.min(1000, Number(query.limit)),
      offset: query.offset === undefined ? undefined : Number(query.offset),
    }));
  })
  .get('/recordings/:id', async c => {
    const recording = await services.corpus.getRecording(c.req.param('id'));
    if (!recording) return c.json({ error: { code: 'not_found', message: 'recording not found' } }, 404);
    const adapter = adapterFor(recording.protocol);
    const frames = decodeWireFrames(recording.response.wire, recording.response.chunks).map(frame => {
      const info = adapter.frameInfo(frame);
      return { t: frame.t, kind: frame.kind, event: frame.sseEvent ?? null, raw: frame.raw, content: info.content, contentChars: info.contentChars, error: info.error };
    });
    const { chunks, ...response } = recording.response;
    return c.json({
      ...recording,
      response: { ...response, chunks: chunks.map(chunk => ({ t: chunk.t, bytes: chunk.bytes.byteLength })) },
      frames,
    });
  })
  .get('/recordings/:id/body', async c => {
    const recording = await services.corpus.getRecording(c.req.param('id'));
    if (!recording) return c.json({ error: { code: 'not_found', message: 'recording not found' } }, 404);
    const contentType = recording.response.headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? 'application/octet-stream';
    return new Response(Buffer.concat(recording.response.chunks.map(chunk => chunk.bytes)), { headers: { 'content-type': contentType } });
  })
  .delete('/recordings/:id', async c => (await services.corpus.deleteRecording(c.req.param('id')) ? c.body(null, 204) : c.json({ error: { code: 'not_found', message: 'recording not found' } }, 404)))

// ── Cassettes ──

  .get('/cassettes', c => c.json({ items: services.corpus.listCassettes() }))
  .get('/cassettes/:id', c => {
    const cassette = services.corpus.cassette(c.req.param('id'));
    if (!cassette) return c.json({ error: { code: 'not_found', message: 'cassette not found' } }, 404);
    return c.json({ ...cassette, recordings: services.corpus.list({ cassetteId: cassette.id, limit: 1000 }).items });
  })
  .patch('/cassettes/:id', async c => {
    const patch = await parseJsonBody(c.req.raw, cassettePatchSchema);
    const cassette = services.corpus.updateCassette(c.req.param('id'), patch);
    return cassette ? c.json(cassette) : c.json({ error: { code: 'not_found', message: 'cassette not found' } }, 404);
  })
  .delete('/cassettes/:id', async c => (await services.corpus.deleteCassette(c.req.param('id'), c.req.query('recordings') === 'true') ? c.body(null, 204) : c.json({ error: { code: 'not_found', message: 'cassette not found' } }, 404)))

// ── Scenarios ──

  .get('/scenarios', c => c.json({ items: services.config.listScenarios().map(scenarioView) }))
  .get('/scenarios/:name', c => {
    const stored = services.config.getScenario(c.req.param('name'));
    return stored ? c.json(scenarioView(stored)) : c.json({ error: { code: 'not_found', message: 'scenario not found' } }, 404);
  })
  // The body is the scenario's YAML (or JSON) source.
  .put('/scenarios/:name', async c => c.json(scenarioView(services.config.upsertScenario(await c.req.text(), c.req.param('name')))))
  .delete('/scenarios/:name', c => (services.config.deleteScenario(c.req.param('name')) ? c.body(null, 204) : c.json({ error: { code: 'not_found', message: 'scenario not found' } }, 404)))
  .post('/scenarios/:name/reset', c => {
    services.sessions.reset(c.req.param('name'));
    return c.body(null, 204);
  })
  // Plans a request against a scenario without sending anything: which
  // recording, which fault, and every write with its time.
  .post('/scenarios/:name/preview', async c => {
    const stored = services.config.getScenario(c.req.param('name'));
    if (!stored) return c.json({ error: { code: 'not_found', message: 'scenario not found' } }, 404);
    const input = await parseJsonBody(c.req.raw, previewSchema);
    const path = input.path ?? '';
    const url = new URL(path || '/', 'http://flowmock.invalid');
    const endpoint = input.protocol === 'gemini-generate-content' ? matchEndpoint(url.pathname, url.search) : null;
    if (input.protocol === 'gemini-generate-content' && !endpoint) throw new ConfigError('Gemini previews need the request path, e.g. /v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    const prepared = prepareRequest({
      protocol: input.protocol,
      transport: input.transport,
      body: input.body,
      streamWire: endpoint?.streamWire,
      pathModel: endpoint?.pathModel,
      pathStream: endpoint?.pathStream,
      session: input.session ?? null,
    });
    const seed = input.seed ?? (stored.scenario.seed === undefined ? freshSeed() : String(stored.scenario.seed));
    const outcome = await planReplay(prepared, { scenario: stored.scenario, callIndex: input.callIndex, seed, nowMs: Date.now(), scenarioElapsedMs: 0, inFlight: 1 }, services.corpus);
    const decoder = new TextDecoder();
    return c.json({
      trace: outcome.trace,
      plan: {
        transport: outcome.plan.transport,
        status: outcome.plan.status,
        headers: outcome.plan.headers,
        headersAt: outcome.plan.headersAt,
        end: outcome.plan.end,
        expected: outcome.plan.expected,
        outputTokens: outcome.plan.outputTokens,
        writes: outcome.plan.writes.map(write => ({
          at: write.at,
          frame: write.frame,
          content: write.content,
          bytes: write.bytes?.byteLength ?? write.text?.length ?? 0,
          text: (write.text ?? decoder.decode(write.bytes)).slice(0, MAX_PREVIEW_TEXT),
        })),
      },
    });
  })

// ── Keys and targets ──

  .get('/keys', c => c.json({ items: services.config.listKeys() }))
  .post('/keys', async c => c.json(services.config.upsertKey(await parseJsonBody(c.req.raw, keyInputSchema)), 201))
  .delete('/keys/:key', c => (services.config.deleteKey(c.req.param('key')) ? c.body(null, 204) : c.json({ error: { code: 'not_found', message: 'key not found' } }, 404)))
  .get('/targets', c => c.json({ items: services.config.listTargets().map(targetView) }))
  .post('/targets', async c => c.json(targetView(services.config.upsertTarget(await parseJsonBody(c.req.raw, targetInputSchema))), 201))
  .delete('/targets/:id', c => (services.config.deleteTarget(c.req.param('id')) ? c.body(null, 204) : c.json({ error: { code: 'not_found', message: 'target not found' } }, 404)))

// ── Observability ──

  .get('/live', c => liveStream(c, services))
  .get('/requests/stream', c => requestStream(c, services))
  .get('/requests', c => {
    const limit = Number(c.req.query('limit') ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return c.json({ error: { code: 'invalid_request', message: 'limit must be an integer between 1 and 1000' } }, 400);
    return c.json({ items: services.timeline.list(limit, { before: c.req.query('before'), mode: c.req.query('mode'), keyName: c.req.query('key'), protocol: c.req.query('protocol'), outcome: c.req.query('outcome') }) }, 200);
  })
  .get('/requests/:id', c => {
    const entry = services.timeline.get(c.req.param('id'));
    return entry ? c.json(entry) : c.json({ error: { code: 'not_found', message: 'request not found in the timeline' } }, 404);
  })

// ── Schemas ──

  .get('/schema/scenario', c => c.json(z.toJSONSchema(scenarioSchema, { io: 'input', unrepresentable: 'any' })))
  .get('/transforms', c => c.json({
    items: listTransforms().map(definition => ({
      type: definition.type,
      stage: definition.stage,
      description: definition.description,
      schema: z.toJSONSchema(definition.schema, { io: 'input', unrepresentable: 'any' }),
    })),
  }))

// ── Portable corpus ──

  .get('/export', async c => new Response(await exportCorpus(services, { cassetteId: c.req.query('cassette') }), { headers: { 'content-type': 'application/x-ndjson' } }))
  .post('/import', async c => c.json(await importCorpus(services, await c.req.text())));
