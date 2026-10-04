// Ported from Floway packages/protocols/src/anthropic-messages/usage.ts (MIT). See NOTICE.md.

export interface AnthropicMessagesUsageServerToolUse {
  web_search_requests?: number;
}

export interface AnthropicMessagesUsageIteration {
  type: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  } | null;
  [key: string]: unknown;
}

// The beta usage union includes model attempts, advisor attempts, and
// compaction entries, and remains additively extensible. FlowMock only needs an
// isolated opaque snapshot, not a closed projection of those variants.
// https://github.com/anthropics/anthropic-sdk-typescript/blob/3b45cd3b69c956ac63384fdb09ce1d8109f3fa80/src/resources/beta/messages/messages.ts#L1724-L1829
export const cloneAnthropicMessagesUsageIterations = (iterations: AnthropicMessagesUsageIteration[] | null): AnthropicMessagesUsageIteration[] | null =>
  iterations === null ? null : structuredClone(iterations);

export interface AnthropicMessagesCacheCreationTtlTokens {
  ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
}

// Cumulative whole-message counters. Every one of them but `output_tokens` is
// declared nullable upstream and carries `null` when the bucket does not apply
// to the request, while upstreams that never opted into the owning feature
// omit the field instead — the SDK's own accumulator reads both spellings as
// "no value" and overwrites only when the counter is present.
// https://github.com/anthropics/anthropic-sdk-typescript/blob/18ea26d324911c3236f2ce762dd0c87f04d038d3/src/resources/messages/messages.ts#L1169-L1204
// https://github.com/anthropics/anthropic-sdk-typescript/blob/18ea26d324911c3236f2ce762dd0c87f04d038d3/src/lib/MessageStream.ts#L592-L616
export interface AnthropicMessagesUsageDelta {
  input_tokens?: number | null;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  // Per-TTL split for cache writes introduced by extended-cache-ttl-2025-04-11.
  // Each `ephemeral_*` field is a disjoint subset of `cache_creation_input_tokens`
  // (the legacy flat field is the sum of both); upstreams that have not opted
  // into the beta omit `cache_creation` entirely and emit only the flat field.
  cache_creation?: AnthropicMessagesCacheCreationTtlTokens | null;
  // `thinking_tokens` is the reasoning subset of the inclusive `output_tokens`
  // total, re-tokenized from the raw reasoning rather than from the possibly
  // summarized thinking text that reaches the response body, so it can differ
  // from the model's own generation count by a few tokens.
  // https://github.com/anthropics/anthropic-sdk-typescript/blob/3b45cd3b69c956ac63384fdb09ce1d8109f3fa80/src/resources/messages/messages.ts#L1292-L1304
  output_tokens_details?: { thinking_tokens: number } | null;
  // https://docs.claude.com/en/api/service-tiers
  service_tier?: 'standard' | 'priority' | 'batch' | (string & {}) | null;
  // https://docs.claude.com/en/build-with-claude/fast-mode
  speed?: 'standard' | 'fast' | (string & {}) | null;
  server_tool_use?: AnthropicMessagesUsageServerToolUse | null;
  iterations?: AnthropicMessagesUsageIteration[] | null;
}

// The whole-message totals, carried by the non-streaming response body and by
// the `message_start` snapshot that reuses it — the two places upstream
// declares `input_tokens` non-null. Upstream's own delta carrier declares a
// narrower field set than the type above, which stays widened because real
// upstreams do repeat the tier and per-TTL fields on `message_delta`.
// https://github.com/anthropics/anthropic-sdk-typescript/blob/18ea26d324911c3236f2ce762dd0c87f04d038d3/src/resources/messages/messages.ts#L2362-L2412
export interface AnthropicMessagesUsage extends Omit<AnthropicMessagesUsageDelta, 'input_tokens'> {
  input_tokens: number;
}
