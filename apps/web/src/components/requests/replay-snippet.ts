import type { RequestDetail } from '../../api/types.ts';

// The header each protocol's clients carry their key in.
// https://docs.anthropic.com/en/api/overview#authentication
// https://platform.openai.com/docs/api-reference/authentication
// https://ai.google.dev/api/generate-content#method:-models.generatecontent
const AUTH_HEADERS: Record<string, string> = {
  'anthropic-messages': 'x-api-key: $FLOWMOCK_KEY',
  'openai-chat-completions': 'authorization: Bearer $FLOWMOCK_KEY',
  'openai-responses': 'authorization: Bearer $FLOWMOCK_KEY',
  'gemini-generate-content': 'x-goog-api-key: $FLOWMOCK_KEY',
};

// The Messages API refuses a request without its version header.
// https://docs.anthropic.com/en/api/versioning
const VERSION_HEADERS: Record<string, string> = { 'anthropic-messages': 'anthropic-version: 2023-06-01' };

const quoted = (header: string) => (header.includes('$') ? `"${header}"` : `'${header}'`);

// A curl that sends the request again under this replay's scenario, seed and
// session. The body is not kept with the trace, so it is read from a file the
// reader saves it to.
export const replayCurl = (origin: string, entry: Pick<RequestDetail, 'path' | 'protocol' | 'trace'>): string | null => {
  if (entry.trace === null) return null;
  const headers = [
    AUTH_HEADERS[entry.protocol],
    VERSION_HEADERS[entry.protocol],
    'content-type: application/json',
    `x-flowmock-scenario: ${entry.trace.scenario}`,
    `x-flowmock-seed: ${entry.trace.seed}`,
    `x-flowmock-session: ${entry.trace.sessionId}`,
  ].filter((header): header is string => header !== undefined);
  return [`curl ${origin}${entry.path} \\`, ...headers.map(header => `  -H ${quoted(header)} \\`), '  --data @request.json'].join('\n');
};

// Protocols whose body names the model and the streaming choice. Gemini
// carries both in the path, which the trace keeps as the client sent it.
// https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
const BODY_CARRIES_MODEL: ReadonlySet<string> = new Set(['anthropic-messages', 'openai-chat-completions', 'openai-responses']);

// The body an exact match is replayed with. The trace keeps no request body,
// but an exact match names a recording of the same conversation; the
// fingerprint leaves out the model and the streaming choice, and both change
// the plan, so they are put back to this request's. A frame collected from a
// recorded stream means this request asked for one JSON body.
export const replayBody = (entry: Pick<RequestDetail, 'model' | 'protocol' | 'trace'>, recordedBody: unknown): unknown => {
  if (entry.trace?.selection?.mode !== 'exact' || typeof recordedBody !== 'object' || recordedBody === null) return null;
  if (!BODY_CARRIES_MODEL.has(entry.protocol)) return recordedBody;
  const body: Record<string, unknown> = { ...recordedBody };
  if (entry.model !== null) body.model = entry.model;
  if (entry.trace.frames.some(frame => frame.origin === 'collected')) body.stream = false;
  return body;
};
