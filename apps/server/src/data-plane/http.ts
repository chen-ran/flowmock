import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

import type { HttpBindings } from '@hono/node-server';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import type { Context } from 'hono';
import { request as undiciRequest } from 'undici';

import { type Endpoint, extractKey, protocolErrorResponse, readOverrides, stripModelSuffix } from './endpoints.ts';
import { NodeHttpTransport } from '../runtime/http-transport.ts';
import type { Services } from '../services.ts';
import type { KeyBinding, Target } from '../store/config-store.ts';
import {
  buildRecording,
  detectResponseWire,
  freshSeed,
  type HeaderList,
  newId,
  planReplay,
  prepareRequest,
  type PreparedRequest,
  type RecordedChunk,
  recordedConversation,
  redactHeaders,
  redactPath,
  runHttpPlan,
} from '@flowmock/core';

type DataPlaneContext = Context<{ Bindings: HttpBindings }>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const handleDataPlane = async (c: DataPlaneContext, services: Services, endpoint: Endpoint): Promise<Response> => {
  const origin = services.clock.now();
  const url = new URL(c.req.url);
  const key = extractKey(c.req.raw.headers, url);
  const binding = key === null ? null : services.config.getKey(key);
  if (!binding) {
    return protocolErrorResponse(endpoint.protocol, 401, 'authentication_error', key === null ? 'FlowMock: no API key was presented.' : 'FlowMock: this API key is not bound to a record target or replay scenario.');
  }
  const raw = new Uint8Array(await c.req.arrayBuffer());
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    return protocolErrorResponse(endpoint.protocol, 400, 'invalid_request_error', 'FlowMock: the request body must be JSON.');
  }
  return binding.mode === 'record'
    ? await recordHttp(c, services, endpoint, binding, url, raw, body)
    : await replayHttp(c, services, endpoint, binding, url, body, origin);
};

// ── Replay ──

const replayHttp = async (c: DataPlaneContext, services: Services, rawEndpoint: Endpoint, binding: KeyBinding, url: URL, rawBody: unknown, origin: number): Promise<Response> => {
  const overrides = readOverrides(c.req.raw.headers);
  const { endpoint, body, scenario: modelScenario } = stripModelSuffix(rawEndpoint, rawBody);
  const scenarioName = overrides.scenario ?? modelScenario ?? binding.scenario ?? 'default';
  const stored = services.config.getScenario(scenarioName);
  if (!stored) return protocolErrorResponse(endpoint.protocol, 404, 'not_found_error', `FlowMock: scenario ${scenarioName} does not exist.`);

  const previous = endpoint.protocol === 'openai-responses' && isObject(body) && typeof body.previous_response_id === 'string' ? body.previous_response_id : null;
  const prepared = prepareRequest({
    protocol: endpoint.protocol,
    transport: 'http',
    body,
    streamWire: endpoint.streamWire,
    pathModel: endpoint.pathModel,
    pathStream: endpoint.pathStream,
    history: services.conversations.get(previous),
    session: overrides.session,
  });

  if (endpoint.kind === 'count_tokens') {
    // Neither SDK nor agent depends on the exact count; four characters per
    // token keeps the estimate in the right range.
    const tokens = Math.ceil(prepared.normalized.features.inputChars / 4);
    return c.json(endpoint.protocol === 'gemini-generate-content' ? { totalTokens: tokens } : { input_tokens: tokens });
  }

  const startedAt = Date.now();
  const callIndex = services.sessions.nextCall(binding.key, stored.name, prepared.sessionId);
  const inFlight = services.sessions.enter(binding.key);
  const requestId = newId('req');
  try {
    const seed = overrides.seed ?? (stored.scenario.seed === undefined ? freshSeed() : String(stored.scenario.seed));
    const outcome = await planReplay(prepared, {
      scenario: stored.scenario,
      callIndex,
      seed,
      nowMs: startedAt,
      scenarioElapsedMs: services.sessions.elapsed(stored.name, startedAt),
      inFlight,
    }, services.corpus);
    const plan = outcome.plan;
    plan.headers = [
      ...plan.headers,
      ['x-flowmock-request-id', requestId],
      ...(outcome.trace.recordingId === null ? [] : [['x-flowmock-recording-id', outcome.trace.recordingId] as [string, string]]),
    ];
    const result = await runHttpPlan(plan, new NodeHttpTransport(c.env.outgoing), services.clock, origin);
    if (outcome.conversation && result.outcome === 'completed') services.conversations.set(outcome.conversation.responseId, outcome.conversation.items);

    services.metrics.requests.inc({ protocol: endpoint.protocol, mode: 'replay', outcome: outcome.trace.error ? `flowmock_${outcome.trace.error.code}` : result.outcome });
    if (outcome.trace.fault) services.metrics.faults.inc({ type: outcome.trace.fault.type });
    if (result.achievedTtftMs !== null) services.metrics.ttft.observe({ protocol: endpoint.protocol }, result.achievedTtftMs);
    if (result.achievedTps !== null) services.metrics.tps.observe({ protocol: endpoint.protocol }, result.achievedTps);
    services.timeline.add({
      id: requestId,
      startedAt,
      mode: 'replay',
      keyName: binding.name,
      protocol: endpoint.protocol,
      transport: 'http',
      method: c.req.method,
      path: redactPath(url.pathname + url.search),
      model: prepared.normalized.model,
      status: plan.status,
      durationMs: result.endedAt,
      recordingId: outcome.trace.recordingId,
      cassetteId: null,
      trace: outcome.trace,
      result,
      expected: plan.expected,
      outcome: result.outcome,
      error: outcome.trace.error?.message ?? result.error,
    });
  } finally {
    services.sessions.leave(binding.key);
  }
  return RESPONSE_ALREADY_SENT;
};

// ── Recording ──

// Headers that describe the client's own connection.
const CONNECTION_HEADERS = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'host', 'content-length']);

// Not forwarded upstream: the connection, the client's credentials (the
// target's configured headers stand in for them) and its encoding wishes.
const NOT_FORWARDED = new Set([...CONNECTION_HEADERS, 'accept-encoding', 'authorization', 'x-api-key', 'x-goog-api-key', 'api-key']);

const RESPONSE_NOT_FORWARDED = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'content-length', 'content-encoding']);

export const upstreamHeaders = (incoming: Headers, target: Target): Record<string, string> => {
  const headers: Record<string, string> = {};
  incoming.forEach((value, name) => {
    if (!NOT_FORWARDED.has(name) && !name.startsWith('x-flowmock-')) headers[name] = value;
  });
  for (const [name, value] of Object.entries(target.headers)) headers[name.toLowerCase()] = value;
  // Bodies are recorded as the client would read them.
  headers['accept-encoding'] = 'identity';
  return headers;
};

export const upstreamUrl = (target: Target, url: URL, pathname = url.pathname): string => {
  const search = new URLSearchParams(url.search);
  // A Gemini `key` parameter carries the mock key, never the upstream one.
  search.delete('key');
  const query = search.toString();
  return `${target.baseUrl}${pathname}${query ? `?${query}` : ''}`;
};

const flattenHeaders = (headers: Record<string, string | string[] | undefined>): HeaderList =>
  Object.entries(headers).flatMap(([name, value]) => (value === undefined ? [] : Array.isArray(value) ? value.map(item => [name, item] as [string, string]) : [[name, value] as [string, string]]));

const decoded = (body: Readable, encoding: string | null): Readable => {
  switch (encoding?.toLowerCase()) {
  case 'gzip':
  case 'x-gzip':
    return body.pipe(createGunzip());
  case 'deflate':
    return body.pipe(createInflate());
  case 'br':
    return body.pipe(createBrotliDecompress());
  default:
    return body;
  }
};

const recordHttp = async (c: DataPlaneContext, services: Services, rawEndpoint: Endpoint, binding: KeyBinding, url: URL, raw: Uint8Array, rawBody: unknown): Promise<Response> => {
  const target = binding.targetId === null ? null : services.config.getTarget(binding.targetId);
  if (!target) return protocolErrorResponse(rawEndpoint.protocol, 500, 'api_error', `FlowMock: record target ${binding.targetId ?? '(none)'} does not exist.`);
  const overrides = readOverrides(c.req.raw.headers);
  const { endpoint, body, scenario: suffix } = stripModelSuffix(rawEndpoint, rawBody);
  // Forward the client's bytes untouched unless a model suffix had to go.
  const forwardBody = suffix === null ? raw : new TextEncoder().encode(JSON.stringify(body));
  const pathname = endpoint.pathModel !== undefined && rawEndpoint.pathModel !== endpoint.pathModel
    ? url.pathname.replace(/\/models\/[^/:]+:/, `/models/${endpoint.pathModel}:`)
    : url.pathname;

  const previous = endpoint.protocol === 'openai-responses' && isObject(body) && typeof body.previous_response_id === 'string' ? body.previous_response_id : null;
  const prepared = prepareRequest({
    protocol: endpoint.protocol,
    transport: 'http',
    body,
    streamWire: endpoint.streamWire,
    pathModel: endpoint.pathModel,
    pathStream: endpoint.pathStream,
    history: services.conversations.get(previous),
    session: overrides.session,
  });
  const save = endpoint.kind === 'generate';
  const slot = save ? services.cassettes.claim({ keyName: binding.name, key: binding.key, targetId: target.id, sessionId: prepared.sessionId }) : null;
  const requestId = newId('req');
  const startedAt = Date.now();
  const transport = new NodeHttpTransport(c.env.outgoing);
  const upstreamAbort = new AbortController();
  transport.signal.addEventListener('abort', () => upstreamAbort.abort(transport.signal.reason), { once: true });

  const dispatchedAt = services.clock.now();
  let upstream: Awaited<ReturnType<typeof undiciRequest>>;
  try {
    upstream = await undiciRequest(upstreamUrl(target, url, pathname), {
      method: 'POST',
      headers: upstreamHeaders(c.req.raw.headers, target),
      body: forwardBody,
      signal: upstreamAbort.signal,
      headersTimeout: 10 * 60_000,
      bodyTimeout: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    services.timeline.add({
      id: requestId, startedAt, mode: 'record', keyName: binding.name, protocol: endpoint.protocol, transport: 'http', method: 'POST', path: redactPath(url.pathname + url.search),
      model: prepared.normalized.model, status: 502, durationMs: services.clock.now() - dispatchedAt, recordingId: null, cassetteId: slot?.cassetteId ?? null,
      trace: null, result: null, expected: null, outcome: 'network_error', error: message,
    });
    services.metrics.requests.inc({ protocol: endpoint.protocol, mode: 'record', outcome: 'network_error' });
    return protocolErrorResponse(endpoint.protocol, 502, 'api_error', `FlowMock: the record target ${target.id} could not be reached: ${message}`);
  }
  const headersAt = services.clock.now() - dispatchedAt;
  const responseHeaders = flattenHeaders(upstream.headers as Record<string, string | string[] | undefined>);
  const contentEncoding = responseHeaders.find(([name]) => name === 'content-encoding')?.[1] ?? null;
  transport.writeHead(upstream.statusCode, [...responseHeaders.filter(([name]) => !RESPONSE_NOT_FORWARDED.has(name)), ['x-flowmock-request-id', requestId]]);

  const chunks: RecordedChunk[] = [];
  let complete = false;
  let failure: string | null = null;
  try {
    for await (const chunk of decoded(upstream.body, contentEncoding)) {
      const bytes = new Uint8Array(chunk as Buffer);
      chunks.push({ t: services.clock.now() - dispatchedAt, bytes });
      await transport.write(bytes);
    }
    complete = true;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const endedAt = services.clock.now() - dispatchedAt;
  const clientAborted = transport.signal.aborted;
  upstream.body.destroy();

  let recordingId: string | null = null;
  let outcome: string;
  const response = {
    status: upstream.statusCode,
    headers: responseHeaders.filter(([name]) => name !== 'content-encoding'),
    headersAt,
    wire: detectResponseWire({ status: upstream.statusCode, contentType: responseHeaders.find(([name]) => name === 'content-type')?.[1] ?? null, stream: prepared.stream, streamWire: endpoint.streamWire ?? 'sse' }),
    chunks,
    complete,
    endedAt,
  };
  // The recording is stored before the response completes, so a client that
  // replays right after its recording run always finds it.
  try {
    if (save) {
      const recording = buildRecording({
        id: newId('rec'),
        createdAt: startedAt,
        transport: 'http',
        request: {
          method: 'POST',
          path: redactPath(url.pathname + url.search),
          headers: redactHeaders([...c.req.raw.headers.entries()].filter(([name]) => !CONNECTION_HEADERS.has(name))),
          body,
        },
        response,
        prepared,
        cassetteId: slot?.cassetteId ?? null,
        cassetteSeq: slot?.seq ?? null,
      });
      // A recording the client cut short is not what the upstream would have
      // sent; it stays in the corpus but out of default selection.
      if (clientAborted && !complete) recording.features.outcome = 'client_aborted';
      await services.corpus.saveRecording(recording);
      recordingId = recording.id;
      outcome = recording.features.outcome;
      rememberConversation(services, prepared, response);
      services.metrics.recordings.inc({ protocol: endpoint.protocol, outcome });
    } else {
      outcome = complete ? 'proxied' : 'truncated';
    }
  } finally {
    // An upstream that broke off mid-body breaks off the client's body too.
    if (complete) await transport.end();
    else if (!clientAborted) transport.abort();
  }
  services.metrics.requests.inc({ protocol: endpoint.protocol, mode: 'record', outcome });
  services.timeline.add({
    id: requestId, startedAt, mode: 'record', keyName: binding.name, protocol: endpoint.protocol, transport: 'http', method: 'POST', path: redactPath(url.pathname + url.search),
    model: prepared.normalized.model, status: upstream.statusCode, durationMs: endedAt, recordingId, cassetteId: slot?.cassetteId ?? null,
    trace: null, result: null, expected: null, outcome, error: failure,
  });
  return RESPONSE_ALREADY_SENT;
};

export const rememberConversation = (services: Services, prepared: PreparedRequest, response: Parameters<typeof recordedConversation>[1]): void => {
  const conversation = recordedConversation(prepared, response);
  if (conversation) services.conversations.set(conversation.responseId, conversation.items);
};
