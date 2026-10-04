// Ported from Floway packages/protocols/src/openai-chat-completions/errors.ts (MIT). See NOTICE.md.

type JsonObject = Record<string, unknown>;

// Inlined permissive object-like guard.
const isObjectLike = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null;

export const openaiChatCompletionsErrorPayloadMessage = (value: unknown): string | null => {
  if (!isObjectLike(value) || !isObjectLike(value.error)) return null;

  const type = typeof value.error.type === 'string' ? value.error.type : null;
  const message = typeof value.error.message === 'string' ? value.error.message : JSON.stringify(value.error);

  return `${type ? `${type}: ` : ''}${message}`;
};
