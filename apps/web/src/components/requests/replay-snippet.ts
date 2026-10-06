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
