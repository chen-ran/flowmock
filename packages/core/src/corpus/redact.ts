import type { HeaderList } from './types.ts';

// Credentials never reach the corpus. The header names cover every
// authentication scheme the four protocols use.
const CREDENTIAL_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
  'x-goog-api-key',
  'cookie',
  'openai-organization',
  'openai-project',
  'anthropic-organization-id',
]);

export const REDACTED = '[redacted]';

export const redactHeaders = (headers: HeaderList): HeaderList =>
  headers.map(([name, value]) => [name, CREDENTIAL_HEADERS.has(name.toLowerCase()) ? REDACTED : value]);

// Gemini also accepts the key as a `key` query parameter.
export const redactPath = (path: string): string => path.replace(/([?&]key=)[^&#]*/gi, `$1${REDACTED}`);
