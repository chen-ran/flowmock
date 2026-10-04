// Ported from Floway packages/protocols/src/common/json.ts (MIT). See NOTICE.md.

export type JsonObject = Record<string, unknown>;

// Strict object guard: rejects arrays.
export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
