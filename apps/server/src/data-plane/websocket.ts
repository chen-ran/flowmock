import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocket, type WebSocketServer } from 'ws';

import { extractKey, readOverrides, RESPONSES_WEBSOCKET_PATHS, splitModelSuffix } from './endpoints.ts';
import { rememberConversation, upstreamHeaders, upstreamUrl } from './http.ts';
import { WsMessageTransport } from '../runtime/ws-transport.ts';
import type { Services } from '../services.ts';
import type { KeyBinding, Target } from '../store/config-store.ts';
import {
  buildRecording,
  freshSeed,
  newId,
  planReplay,
  prepareRequest,
  type RecordedChunk,
  redactHeaders,
  redactPath,
  runMessagePlan,
} from '@flowmock/core';

// Responses over WebSocket: each `response.create` message is one turn and
// the server answers with the same event objects the HTTP stream carries,
// one per message. The creation fields sit at the top level of the message;
// a nested `response` envelope is accepted too.
// https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/src/specifications/2026-04-24.mdx#L99-L127

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const responsesCreatePayload = (message: Record<string, unknown>): Record<string, unknown> =>
  isObject(message.response) ? message.response : Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'type' && key !== 'event_id'));

const sendError = (socket: WebSocket, status: number, type: string, message: string): void => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'error', status, error: { type, code: type, message } }));
};

const rejectUpgrade = (socket: Duplex, status: number, message: string): void => {
  const body = JSON.stringify({ error: { message, type: status === 401 ? 'authentication_error' : 'invalid_request_error' } });
  socket.end(`HTTP/1.1 ${status} ${status === 503 ? 'Service Unavailable' : status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'Bad Request'}\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n${body}`);
};

const headersOf = (request: IncomingMessage): Headers => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  return headers;
};

const parseMessage = (data: unknown): Record<string, unknown> | string => {
  const text = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : Array.isArray(data) ? Buffer.concat(data as Buffer[]).toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8');
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isObject(parsed) || typeof parsed.type !== 'string') return 'WebSocket message must be a JSON object with a string type.';
    return parsed;
  } catch (error) {
    return `WebSocket message must be valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
};

export const createUpgradeHandler = (services: Services, wss: WebSocketServer) => (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
  if (services.stopping) { rejectUpgrade(socket, 503, 'FlowMock is shutting down.'); return; }
  const url = new URL(request.url ?? '/', 'http://flowmock.invalid');
  if (!RESPONSES_WEBSOCKET_PATHS.has(url.pathname)) {
    rejectUpgrade(socket, 404, `FlowMock serves WebSocket only on ${[...RESPONSES_WEBSOCKET_PATHS].join(' and ')}.`);
    return;
  }
  const headers = headersOf(request);
  const key = extractKey(headers, url);
  const binding = key === null ? null : services.config.getKey(key);
  if (!binding) {
    rejectUpgrade(socket, 401, 'FlowMock: this API key is not bound to a record target or replay scenario.');
    return;
  }
  const target = binding.mode === 'record' && binding.targetId !== null ? services.config.getTarget(binding.targetId) : null;
  if (binding.mode === 'record' && !target) {
    rejectUpgrade(socket, 400, `FlowMock: record target ${binding.targetId ?? '(none)'} does not exist.`);
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => {
    if (binding.mode === 'replay') replayConnection(services, ws, binding, headers, url);
    else recordConnection(services, ws, binding, target!, headers, url);
  });
};

// ── Replay ──

const replayConnection = (services: Services, ws: WebSocket, binding: KeyBinding, headers: Headers, url: URL): void => {
  const overrides = readOverrides(headers);
  const connection = new AbortController();
  ws.on('close', () => connection.abort(new Error('client closed the WebSocket')));
  ws.on('error', () => connection.abort(new Error('WebSocket error')));
  let queue = Promise.resolve();

  ws.on('message', data => {
    if (services.stopping) return sendError(ws, 503, 'server_error', 'FlowMock is shutting down.');
    const origin = services.clock.now();
    queue = services.inflight.track(queue.then(async () => {
      if (connection.signal.aborted) return;
      const message = parseMessage(data);
      if (typeof message === 'string') return sendError(ws, 400, 'invalid_request_error', message);
      if (message.type !== 'response.create') return sendError(ws, 400, 'invalid_request_error', `Unsupported WebSocket event type '${message.type as string}'.`);
      await replayTurn(services, ws, binding, overrides, url, responsesCreatePayload(message), origin, connection.signal);
    })).catch(error => {
      sendError(ws, 500, 'server_error', `FlowMock: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    });
  });
};

const replayTurn = async (services: Services, ws: WebSocket, binding: KeyBinding, overrides: ReturnType<typeof readOverrides>, url: URL, payload: Record<string, unknown>, origin: number, signal: AbortSignal): Promise<void> => {
  const model = typeof payload.model === 'string' ? splitModelSuffix(payload.model) : { model: null, scenario: null };
  const body = model.scenario === null ? payload : { ...payload, model: model.model };
  const scenarioName = overrides.scenario ?? model.scenario ?? binding.scenario ?? 'default';
  const stored = services.config.getScenario(scenarioName);
  if (!stored) return sendError(ws, 404, 'not_found_error', `FlowMock: scenario ${scenarioName} does not exist.`);
  const prepared = prepareRequest({
    protocol: 'openai-responses',
    transport: 'ws',
    body,
    history: services.conversations.get(typeof body.previous_response_id === 'string' ? body.previous_response_id : null),
    session: overrides.session,
  });
  const startedAt = Date.now();
  const callIndex = services.sessions.nextCall(binding.key, stored.name, prepared.sessionId);
  const inFlight = services.sessions.enter(binding.key);
  const requestId = newId('req');
  try {
    const outcome = await planReplay(prepared, {
      scenario: stored.scenario,
      callIndex,
      seed: overrides.seed ?? (stored.scenario.seed === undefined ? freshSeed() : String(stored.scenario.seed)),
      nowMs: startedAt,
      scenarioElapsedMs: services.sessions.elapsed(stored.name, startedAt),
      inFlight,
    }, services.corpus);
    const result = await runMessagePlan(outcome.plan, new WsMessageTransport(ws, signal), services.clock, origin);
    if (outcome.conversation && result.outcome === 'completed') services.conversations.set(outcome.conversation.responseId, outcome.conversation.items);
    services.metrics.requests.inc({ protocol: 'openai-responses', mode: 'replay', outcome: outcome.trace.error ? `flowmock_${outcome.trace.error.code}` : result.outcome });
    if (outcome.trace.fault) services.metrics.faults.inc({ type: outcome.trace.fault.type });
    if (result.achievedTtftMs !== null) services.metrics.ttft.observe({ protocol: 'openai-responses' }, result.achievedTtftMs);
    if (result.achievedTps !== null) services.metrics.tps.observe({ protocol: 'openai-responses' }, result.achievedTps);
    services.timeline.add({
      id: requestId,
      startedAt,
      mode: 'replay',
      keyName: binding.name,
      protocol: 'openai-responses',
      transport: 'ws',
      method: 'WS',
      path: redactPath(url.pathname),
      model: prepared.normalized.model,
      status: outcome.plan.status,
      durationMs: result.endedAt,
      recordingId: outcome.trace.recordingId,
      cassetteId: null,
      trace: outcome.trace,
      result,
      expected: outcome.plan.expected,
      outcome: result.outcome,
      error: outcome.trace.error?.message ?? result.error,
    });
  } finally {
    services.sessions.leave(binding.key);
  }
};

// ── Recording ──

interface OpenTurn {
  requestId: string;
  startedAt: number;
  dispatchedAt: number;
  message: Record<string, unknown>;
  prepared: ReturnType<typeof prepareRequest>;
  slot: { cassetteId: string; seq: number };
  chunks: RecordedChunk[];
  finish: () => void;
}

const TERMINAL_TYPES = new Set(['response.completed', 'response.incomplete', 'response.failed', 'error']);

const recordConnection = (services: Services, client: WebSocket, binding: KeyBinding, target: Target, headers: Headers, url: URL): void => {
  const overrides = readOverrides(headers);
  const upstreamTarget = upstreamUrl(target, url).replace(/^http/, 'ws');
  const upstream = new WebSocket(upstreamTarget, { headers: upstreamHeaders(headers, target), perMessageDeflate: false });
  const pending: Array<string | Buffer> = [];
  let turn: OpenTurn | null = null;
  const encoder = new TextEncoder();

  const finalize = (complete: boolean, outcomeOverride?: string): Promise<void> => services.inflight.track((async () => {
    const current = turn;
    if (!current) return;
    turn = null;
    try {
      const endedAt = services.clock.now() - current.dispatchedAt;
      const response = {
        status: 200,
        headers: [] as Array<[string, string]>,
        headersAt: 0,
        wire: 'ws' as const,
        chunks: current.chunks,
        complete,
        endedAt,
      };
      const recording = buildRecording({
        id: newId('rec'),
        createdAt: current.startedAt,
        transport: 'ws',
        request: { method: 'WS', path: redactPath(url.pathname), headers: redactHeaders([...headers.entries()]), body: current.message },
        response,
        prepared: current.prepared,
        cassetteId: current.slot.cassetteId,
        cassetteSeq: current.slot.seq,
      });
      if (!complete && services.shutdown.signal.aborted) recording.features.outcome = 'truncated';
      else if (outcomeOverride) recording.features.outcome = outcomeOverride;
      await services.corpus.saveRecording(recording);
      rememberConversation(services, current.prepared, response);
      services.metrics.recordings.inc({ protocol: 'openai-responses', outcome: recording.features.outcome });
      services.metrics.requests.inc({ protocol: 'openai-responses', mode: 'record', outcome: recording.features.outcome });
      services.timeline.add({
        id: current.requestId, startedAt: current.startedAt, mode: 'record', keyName: binding.name, protocol: 'openai-responses', transport: 'ws', method: 'WS', path: redactPath(url.pathname),
        model: current.prepared.normalized.model, status: 200, durationMs: endedAt, recordingId: recording.id, cassetteId: current.slot.cassetteId,
        trace: null, result: null, expected: null, outcome: recording.features.outcome, error: null,
      });
    } finally { services.sessions.leave(binding.key); current.finish(); }
  })());
  const report = (error: unknown) => console.error('[flowmock] recording WebSocket turn failed', error);

  const forwardToUpstream = (data: string | Buffer) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    else pending.push(data);
  };

  client.on('message', (data, isBinary) => {
    if (services.stopping) return sendError(client, 503, 'server_error', 'FlowMock is shutting down.');
    const text = isBinary ? null : data.toString();
    if (text !== null) {
      const message = parseMessage(text);
      if (typeof message !== 'string' && message.type === 'response.create') {
        if (turn) void finalize(false).catch(report);
        let payload = responsesCreatePayload(message);
        let outgoing: string = text;
        if (typeof payload.model === 'string') {
          const { model, scenario } = splitModelSuffix(payload.model);
          if (scenario !== null) {
            payload = { ...payload, model };
            outgoing = JSON.stringify(isObject(message.response) ? { ...message, response: payload } : { ...message, model });
          }
        }
        const prepared = prepareRequest({
          protocol: 'openai-responses',
          transport: 'ws',
          body: payload,
          history: services.conversations.get(typeof payload.previous_response_id === 'string' ? payload.previous_response_id : null),
          session: overrides.session,
        });
        let finish!: () => void;
        void services.inflight.track(new Promise<void>(resolve => { finish = resolve; }));
        services.sessions.enter(binding.key);
        turn = {
          finish,
          requestId: newId('req'),
          startedAt: Date.now(),
          dispatchedAt: services.clock.now(),
          message,
          prepared,
          slot: services.cassettes.claim({ keyName: binding.name, key: binding.key, targetId: target.id, sessionId: prepared.sessionId }),
          chunks: [],
        };
        forwardToUpstream(outgoing);
        return;
      }
    }
    forwardToUpstream(isBinary ? (data as Buffer) : data.toString());
  });

  upstream.on('open', () => {
    for (const data of pending.splice(0)) upstream.send(data);
  });

  // Messages are handled strictly in order. A turn's terminal event is held
  // until its recording is stored, so a client that replays right after the
  // turn always finds it.
  let relay = Promise.resolve();
  upstream.on('message', (data, isBinary) => {
    const arrivedAt = services.clock.now();
    relay = services.inflight.track(relay.then(async () => {
      if (turn && !isBinary) {
        const text = data.toString();
        turn.chunks.push({ t: arrivedAt - turn.dispatchedAt, bytes: encoder.encode(text) });
        const message = parseMessage(text);
        if (typeof message !== 'string' && TERMINAL_TYPES.has(message.type as string)) await finalize(true);
      }
      if (client.readyState === WebSocket.OPEN) await new Promise<void>((resolve, reject) => client.send(data, { binary: isBinary }, error => error ? reject(error) : resolve()));
    })).catch(report);
  });

  upstream.on('close', (code, reason) => {
    void finalize(false).catch(report);
    if (client.readyState === WebSocket.OPEN) client.close(code === 1005 || code === 1006 ? 1011 : code, reason.toString());
  });

  upstream.on('error', error => {
    void finalize(false).catch(report);
    if (client.readyState === WebSocket.OPEN) client.close(1011, `FlowMock: record target ${target.id} failed: ${error.message}`.slice(0, 120));
  });

  client.on('close', () => {
    void finalize(false, 'client_aborted').catch(report);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
  });
};
