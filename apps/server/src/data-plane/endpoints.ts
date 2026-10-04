import { adapterFor, parseGeminiPath } from '@flowmock/core';
import type { Protocol, WireFormat } from '@flowmock/protocols/common';

export interface Endpoint {
  protocol: Protocol;
  kind: 'generate' | 'count_tokens';
  // Gemini carries the model and streaming choice in the path.
  pathModel?: string;
  pathStream?: boolean;
  streamWire?: WireFormat;
}

// The OpenAI SDKs default to a `/v1` base URL while some clients drop it, so
// both spellings are served.
const STATIC_ROUTES: Record<string, Endpoint> = {
  '/v1/messages': { protocol: 'anthropic-messages', kind: 'generate' },
  '/messages': { protocol: 'anthropic-messages', kind: 'generate' },
  '/v1/messages/count_tokens': { protocol: 'anthropic-messages', kind: 'count_tokens' },
  '/messages/count_tokens': { protocol: 'anthropic-messages', kind: 'count_tokens' },
  '/v1/chat/completions': { protocol: 'openai-chat-completions', kind: 'generate' },
  '/chat/completions': { protocol: 'openai-chat-completions', kind: 'generate' },
  '/v1/responses': { protocol: 'openai-responses', kind: 'generate' },
  '/responses': { protocol: 'openai-responses', kind: 'generate' },
};

export const RESPONSES_WEBSOCKET_PATHS = new Set(['/v1/responses', '/responses']);

export const matchEndpoint = (pathname: string, search: string): Endpoint | null => {
  const route = STATIC_ROUTES[pathname];
  if (route) return route;
  if (/^\/(?:v1beta|v1)\/models\/[^/]+:[A-Za-z]+$/.test(pathname)) {
    const gemini = parseGeminiPath(pathname + search);
    if (gemini && (gemini.action === 'generateContent' || gemini.action === 'streamGenerateContent')) {
      return { protocol: 'gemini-generate-content', kind: 'generate', pathModel: gemini.model, pathStream: gemini.stream, streamWire: gemini.streamWire };
    }
    if (gemini?.action === 'countTokens') return { protocol: 'gemini-generate-content', kind: 'count_tokens', pathModel: gemini.model };
  }
  return null;
};

// The credential the client presented, whichever scheme its SDK uses.
export const extractKey = (headers: Headers, url: URL): string | null => {
  for (const name of ['x-api-key', 'x-goog-api-key', 'api-key']) {
    const value = headers.get(name);
    if (value) return value.trim();
  }
  const authorization = headers.get('authorization');
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    return match ? match[1].trim() : authorization.trim();
  }
  return url.searchParams.get('key');
};

export interface Overrides {
  scenario: string | null;
  seed: string | null;
  session: string | null;
}

export const readOverrides = (headers: Headers): Overrides => ({
  scenario: headers.get('x-flowmock-scenario'),
  seed: headers.get('x-flowmock-seed'),
  session: headers.get('x-flowmock-session'),
});

// `model@scenario` selects a scenario for clients that cannot send headers.
// The suffix is removed before the request is matched or forwarded.
export const splitModelSuffix = (model: string): { model: string; scenario: string | null } => {
  const at = model.lastIndexOf('@');
  return at > 0 ? { model: model.slice(0, at), scenario: model.slice(at + 1) || null } : { model, scenario: null };
};

export const stripModelSuffix = (endpoint: Endpoint, body: unknown): { endpoint: Endpoint; body: unknown; scenario: string | null } => {
  if (endpoint.pathModel !== undefined) {
    const { model, scenario } = splitModelSuffix(endpoint.pathModel);
    return { endpoint: { ...endpoint, pathModel: model }, body, scenario };
  }
  if (body !== null && typeof body === 'object' && typeof (body as { model?: unknown }).model === 'string') {
    const { model, scenario } = splitModelSuffix((body as { model: string }).model);
    if (scenario !== null) return { endpoint, body: { ...body, model }, scenario };
  }
  return { endpoint, body, scenario: null };
};

export const protocolErrorBody = (protocol: Protocol, status: number, type: string, message: string): string =>
  JSON.stringify(adapterFor(protocol).errorEnvelope(status, type, message));

export const protocolErrorResponse = (protocol: Protocol, status: number, type: string, message: string): Response =>
  new Response(protocolErrorBody(protocol, status, type, message), { status, headers: { 'content-type': 'application/json' } });
