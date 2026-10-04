// Ported from Floway packages/protocols/src/openai-responses/index.ts (MIT),
// trimmed to the wire types a recorder and replayer need. Item and tool
// variants FlowMock does not inspect are carried by permissive shapes so
// recordings keep them verbatim. See NOTICE.md.

// ── Request types ──

export interface OpenAIResponsesPayload {
  model: string;
  input: string | OpenAIResponsesRequestInputItem[];
  previous_response_id?: string | null;
  instructions?: string | null;
  temperature?: number | null;
  top_p?: number | null;
  max_output_tokens?: number | null;
  max_tool_calls?: number | null;
  tools?: OpenAIResponsesTool[] | null;
  tool_choice?: unknown;
  metadata?: Record<string, unknown> | null;
  stream?: boolean | null;
  store?: boolean | null;
  // `false` asks for a prewarm: a response that records this request's
  // context without generating, which the next request continues from via
  // `previous_response_id`. Codex sends it on its WebSocket transport.
  // https://github.com/openai/codex/blob/6989c6548b3737f108e2bb5ae1171b1d2032e30c/codex-rs/codex-api/src/common.rs#L355
  generate?: boolean | null;
  parallel_tool_calls?: boolean | null;
  reasoning?: {
    effort?: string | null;
    summary?: string | null;
    context?: string | null;
  } | null;
  include?: string[];
  text?: { format?: Record<string, unknown> | null; verbosity?: string | null } | null;
  prompt_cache_key?: string | null;
  safety_identifier?: string | null;
  service_tier?: string | null;
  truncation?: string | null;
  background?: boolean | null;
  top_logprobs?: number | null;
  [key: string]: unknown;
}

export type OpenAIResponsesMessagePhase = 'commentary' | 'final_answer' | (string & {}) | null;

export interface OpenAIResponsesInputMessage {
  type: 'message';
  id?: string;
  status?: string;
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | OpenAIResponsesInputContent[];
  phase?: OpenAIResponsesMessagePhase;
}

// The request schema's EasyInputMessage makes the `type: "message"`
// discriminator optional.
// https://github.com/openai/openai-node/blob/61539248cbe04665de68a71e6fd878127ae4db87/src/resources/responses/responses.ts#L697-L721
export interface OpenAIResponsesEasyInputMessage {
  content: string | OpenAIResponsesInputContent[];
  role: 'user' | 'assistant' | 'system' | 'developer';
  phase?: OpenAIResponsesMessagePhase;
  type?: 'message';
}

export interface OpenAIResponsesInputText {
  type: 'input_text' | 'output_text';
  text: string;
  [key: string]: unknown;
}

export interface OpenAIResponsesInputImage {
  type: 'input_image';
  image_url?: string | null;
  file_id?: string | null;
  detail?: string | null;
  [key: string]: unknown;
}

export interface OpenAIResponsesInputFile {
  type: 'input_file';
  file_data?: string;
  file_id?: string | null;
  file_url?: string;
  filename?: string;
  [key: string]: unknown;
}

export type OpenAIResponsesInputContent = OpenAIResponsesInputText | OpenAIResponsesInputImage | OpenAIResponsesInputFile | OpenAIResponsesOutputRefusal;

export type OpenAIResponsesToolOutputContent = OpenAIResponsesInputText | OpenAIResponsesInputImage | OpenAIResponsesInputFile;

export interface OpenAIResponsesInputReasoning {
  type: 'reasoning';
  id: string;
  summary: { type: 'summary_text'; text: string }[];
  encrypted_content?: string;
}

export interface OpenAIResponsesFunctionToolCallItem {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  namespace?: string;
  arguments: string;
  status?: string;
}

export interface OpenAIResponsesFunctionCallOutputItem {
  type: 'function_call_output';
  id?: string;
  call_id: string;
  output: string | OpenAIResponsesToolOutputContent[];
  status?: string;
}

export interface OpenAIResponsesCustomToolCallItem {
  type: 'custom_tool_call';
  call_id: string;
  name: string;
  input: string;
  id?: string;
  namespace?: string;
  status?: string;
}

export interface OpenAIResponsesCustomToolCallOutputItem {
  type: 'custom_tool_call_output';
  call_id: string;
  output: string | OpenAIResponsesToolOutputContent[];
  id?: string;
  status?: string;
}

export interface OpenAIResponsesItemReference {
  type: 'item_reference';
  id: string;
}

// Every other item type (hosted tool calls, compaction, MCP, shell, ...)
// travels through unchanged.
export interface OpenAIResponsesPermissiveItem {
  type: string;
  id?: string;
  call_id?: string;
  [key: string]: unknown;
}

export type OpenAIResponsesInputItem =
  | OpenAIResponsesInputMessage
  | OpenAIResponsesFunctionToolCallItem
  | OpenAIResponsesFunctionCallOutputItem
  | OpenAIResponsesCustomToolCallItem
  | OpenAIResponsesCustomToolCallOutputItem
  | OpenAIResponsesInputReasoning
  | OpenAIResponsesItemReference;

export type OpenAIResponsesRequestInputItem = OpenAIResponsesEasyInputMessage | OpenAIResponsesInputItem | OpenAIResponsesPermissiveItem;

export interface OpenAIResponsesFunctionTool {
  type: 'function';
  name: string;
  description?: string | null;
  parameters?: Record<string, unknown> | null;
  strict?: boolean | null;
  [key: string]: unknown;
}

export interface OpenAIResponsesCustomTool {
  type: 'custom';
  name: string;
  description?: string;
  format?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenAIResponsesPermissiveTool {
  type: string;
  name?: string;
  [key: string]: unknown;
}

export type OpenAIResponsesTool = OpenAIResponsesFunctionTool | OpenAIResponsesCustomTool | OpenAIResponsesPermissiveTool;

// ── Response types ──

export interface OpenAIResponsesResult {
  id: string;
  object: string;
  model: string;
  output: OpenAIResponsesOutputItem[];
  // SDK-only convenience alias for "all assistant text in this
  // response". Optional on the wire because OpenAI's SDKs derive it
  // from `output` rather than reading it from the JSON (see
  // openai-python `Response.output_text` `@property`, openai-dotnet
  // `[CodeGenSuppress("OutputText")]`, openai-go `func (r Response)
  // OutputText() string`). The captured wire fixture at
  // `openai-dotnet/tests/SessionRecords/ResponsesToolTests/WebSearchCallAsync.json`
  // confirms the field is absent from the response body. Producers
  // that happen to emit it (some OpenAPI implementations do) are
  // preserved as-is on pass-through.
  output_text?: string;
  // https://github.com/openai/openai-node/blob/39a15b412fc129df15339ebd6e3e6547854aa81f/src/resources/responses/responses.ts#L6866-L6870
  status: 'queued' | 'completed' | 'incomplete' | 'failed' | 'in_progress' | 'cancelled';
  // `error` and `incomplete_details` are REQUIRED on the wire shape
  // per the OpenAI Responses spec (both can be null). Reference:
  // https://github.com/openai/openai-openapi/blob/master/openapi.yaml
  // `Response.required` lists both. Native upstreams emit them as
  // `null` on success-path frames; downstream clients (typed SDKs)
  // probe for the field's presence rather than its truthiness, so
  // omitting them on synthesized envelopes breaks parse-time validation.
  //
  // `error.type` is NOT in the OpenAI spec (see ResponseError schema —
  // only `code` and `message` are defined), but kept optional here to
  // accommodate upstreams that publish it as an extension.
  incomplete_details: { reason: string } | null;
  error: { message: string; code: string; type?: string } | null;
  // https://developers.openai.com/api/reference/resources/responses/methods/create
  service_tier?: 'default' | 'auto' | 'flex' | 'priority' | 'scale' | (string & {}) | null;
  // Request params echoed back on the response body. The `Response`
  // schema in OpenAI's openapi.yaml composes `ResponseProperties`, which
  // declares both fields; observed upstream echoes (Copilot, Azure)
  // confirm they're populated with server-enriched defaults.
  tools?: OpenAIResponsesTool[];
  tool_choice?: unknown;
  // The response resource requires `usage` and gives it an explicit `null`
  // alternative, so `null` is what an upstream sends for a response that
  // reported no token counts. The key stays optional because a partially built
  // envelope carries no usage until the terminal event accounts for the turn.
  // https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/public/openapi/openapi.json#L2613-L2629
  // https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/public/openapi/openapi.json#L2691-L2723
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    // Both fields are disjoint subsets of input_tokens. Older compatible
    // upstreams may omit cache_write_tokens even when they provide details.
    // https://github.com/openai/openai-python/blob/f16fbbd2bd25dc1ff150b5f78dbd15ff6bab6d91/src/openai/types/responses/response_usage.py
    // https://github.com/openai/openai-node/blob/61539248cbe04665de68a71e6fd878127ae4db87/src/resources/responses/responses.ts#L7259-L7269
    input_tokens_details?: { cached_tokens: number; cache_write_tokens?: number };
    output_tokens_details?: { reasoning_tokens: number };
  } | null;
  // ── Further fields the response resource declares required ──
  //
  // Every key below is listed in `ResponseResource.required` — as are `tools`,
  // `tool_choice`, `usage` and `service_tier` above — so a spec-conforming
  // client-facing body must carry all of them:
  // https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/public/openapi/openapi.json#L2691-L2723
  // They stay optional here because this interface also models what an
  // arbitrary compatible upstream sends.
  //
  // Unix seconds, not milliseconds.
  created_at?: number;
  // Null until the response reaches a terminal status.
  completed_at?: number | null;
  previous_response_id?: string | null;
  instructions?: string | null;
  truncation?: 'auto' | 'disabled' | (string & {}) | null;
  parallel_tool_calls?: boolean;
  text?: { format?: Record<string, unknown> | null; verbosity?: string | null } | null;
  top_p?: number | null;
  presence_penalty?: number | null;
  frequency_penalty?: number | null;
  top_logprobs?: number | null;
  temperature?: number | null;
  // `effort` and `summary` are themselves required whenever `reasoning` is an
  // object; other keys upstreams add (`context`, `mode`) ride along untouched.
  // https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/public/openapi/openapi.json#L2320-L2359
  reasoning?: {
    effort?: string | null;
    summary?: 'detailed' | 'auto' | 'concise' | (string & {}) | null;
    context?: 'auto' | 'current_turn' | 'all_turns' | (string & {}) | null;
    [key: string]: unknown;
  } | null;
  max_output_tokens?: number | null;
  max_tool_calls?: number | null;
  // Whether the response was stored so it can be retrieved later.
  store?: boolean;
  background?: boolean;
  metadata?: Record<string, unknown> | null;
  safety_identifier?: string | null;
  prompt_cache_key?: string | null;
}

export type OpenAIResponsesOutputItem =
  | OpenAIResponsesOutputMessage
  | OpenAIResponsesOutputFunctionCall
  | OpenAIResponsesCustomToolCallItem
  | OpenAIResponsesOutputReasoning
  | OpenAIResponsesOutputWebSearchCall
  | OpenAIResponsesPermissiveItem;

// The OpenAI Responses item schema requires `status` on an output message and
// `annotations` on every `output_text` part, even when the text carries no
// citations, so both are modeled as required and the compiler forces every
// producer to state them:
// https://github.com/openai/openai-openapi/blob/d2f04809d7961f01e94031e1f31617394599dbdd/openapi.yaml#L44868-L44873
// https://github.com/openai/openai-openapi/blob/d2f04809d7961f01e94031e1f31617394599dbdd/openapi.yaml#L66303-L66307
// `id` is schema-required too but stays optional: an upstream item that omits
// it is surfaced by `requireItemId` rather than given an invented value.
export interface OpenAIResponsesOutputMessage {
  type: 'message';
  id?: string;
  status: string;
  role: 'assistant';
  content: OpenAIResponsesOutputContentBlock[];
  phase?: OpenAIResponsesMessagePhase;
}

export type OpenAIResponsesOutputContentBlock = OpenAIResponsesOutputText | OpenAIResponsesOutputRefusal;

export interface OpenAIResponsesAnnotation {
  type: 'url_citation';
  url: string;
  title: string;
  start_index: number;
  end_index: number;
}

export interface OpenAIResponsesOutputText {
  type: 'output_text';
  text: string;
  annotations: OpenAIResponsesAnnotation[];
}

export interface OpenAIResponsesOutputRefusal {
  type: 'refusal';
  refusal: string;
}

export interface OpenAIResponsesOutputFunctionCall {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  namespace?: string;
  arguments: string;
  status: string;
}

export interface OpenAIResponsesOutputReasoning {
  type: 'reasoning';
  id: string;
  summary: { type: 'summary_text'; text: string }[];
  content?: { type: 'reasoning_text'; text: string }[];
  encrypted_content?: string;
}

export interface OpenAIResponsesOutputWebSearchCall {
  type: 'web_search_call';
  id: string;
  status: string;
  action?: Record<string, unknown>;
}

// ── Stream event types ──

// The spec marks sequence_number required, but some upstreams omit it.
export type OpenAIResponsesStreamEvent = OpenAIResponsesStreamEventVariant & { sequence_number?: number };

type OpenAIResponsesStreamEventVariant =
  // https://github.com/openai/openai-node/blob/39a15b412fc129df15339ebd6e3e6547854aa81f/src/resources/responses/responses.ts#L6456-L6471
  | { type: 'response.queued'; response: OpenAIResponsesResult }
  | { type: 'response.created'; response: OpenAIResponsesResult }
  | { type: 'response.in_progress'; response: OpenAIResponsesResult }
  | {
    type: 'response.output_item.added';
    output_index: number;
    item: OpenAIResponsesOutputItem;
  }
  | {
    type: 'response.output_item.done';
    output_index: number;
    item: OpenAIResponsesOutputItem;
  }
  | {
    type: 'response.content_part.added';
    item_id: string;
    output_index: number;
    content_index: number;
    part: OpenAIResponsesOutputContentBlock;
  }
  | {
    type: 'response.content_part.done';
    item_id: string;
    output_index: number;
    content_index: number;
    part: OpenAIResponsesOutputContentBlock;
  }
  | {
    type: 'response.reasoning_summary_part.added';
    item_id: string;
    output_index: number;
    summary_index: number;
    part: { type: 'summary_text'; text: string };
  }
  | {
    type: 'response.reasoning_summary_part.done';
    item_id: string;
    output_index: number;
    summary_index: number;
    part: { type: 'summary_text'; text: string };
  }
  | {
    type: 'response.reasoning_summary_text.delta';
    item_id: string;
    output_index: number;
    summary_index: number;
    delta: string;
  }
  | {
    type: 'response.reasoning_summary_text.done';
    item_id: string;
    output_index: number;
    summary_index: number;
    text: string;
  }
  // https://github.com/openai/openai-python/blob/d4dceb221b9a92c55c232d5b330ae89beb539415/src/openai/types/responses/response_reasoning_text_delta_event.py#L9-L31
  // https://github.com/openai/openai-python/blob/d4dceb221b9a92c55c232d5b330ae89beb539415/src/openai/types/responses/response_reasoning_text_done_event.py#L9-L34
  | {
    type: 'response.reasoning_text.delta';
    item_id: string;
    output_index: number;
    content_index: number;
    delta: string;
  }
  | {
    type: 'response.reasoning_text.done';
    item_id: string;
    output_index: number;
    content_index: number;
    text: string;
  }
  | {
    type: 'response.output_text.delta';
    item_id: string;
    output_index: number;
    content_index: number;
    delta: string;
  }
  | {
    type: 'response.output_text.done';
    item_id: string;
    output_index: number;
    content_index: number;
    text: string;
  }
  | {
    type: 'response.refusal.delta';
    item_id: string;
    output_index: number;
    content_index: number;
    delta: string;
  }
  | {
    type: 'response.refusal.done';
    item_id: string;
    output_index: number;
    content_index: number;
    refusal: string;
  }
  | {
    type: 'response.output_text.annotation.added';
    output_index: number;
    content_index: number;
    annotation_index: number;
    item_id: string;
    annotation: OpenAIResponsesAnnotation;
  }
  | {
    type: 'response.web_search_call.in_progress';
    output_index: number;
    item_id: string;
  }
  // Intermediate progress event for hosted `web_search`. Native upstreams
  // emit it between `.in_progress` and `.completed`.
  | {
    type: 'response.web_search_call.searching';
    output_index: number;
    item_id: string;
  }
  | {
    type: 'response.web_search_call.completed';
    output_index: number;
    item_id: string;
  }
  | {
    type: 'response.image_generation_call.in_progress';
    output_index: number;
    item_id: string;
  }
  | {
    type: 'response.image_generation_call.generating';
    output_index: number;
    item_id: string;
  }
  | {
    type: 'response.image_generation_call.partial_image';
    output_index: number;
    item_id: string;
    partial_image_index: number;
    partial_image_b64: string;
    background?: 'transparent' | 'opaque';
    output_format?: 'png' | 'jpeg';
    quality?: 'low' | 'medium' | 'high';
    size?: string;
  }
  | {
    type: 'response.image_generation_call.completed';
    output_index: number;
    item_id: string;
  }
  | {
    type: 'response.function_call_arguments.delta';
    item_id: string;
    output_index: number;
    delta: string;
  }
  | {
    type: 'response.function_call_arguments.done';
    item_id: string;
    output_index: number;
    arguments: string;
  }
  | {
    type: 'response.custom_tool_call_input.delta';
    item_id: string;
    output_index: number;
    delta: string;
  }
  | {
    type: 'response.custom_tool_call_input.done';
    item_id: string;
    output_index: number;
    input: string;
  }
  // https://github.com/vercel/ai/blob/6b6a8bbe9247e0ed70c8a7f6e850a1ab16096528/packages/openai/src/responses/__fixtures__/openai-shell-tool.1.chunks.txt#L4-L10
  | {
    type: 'response.shell_call_command.added';
    output_index: number;
    command_index: number;
    command: string;
  }
  | {
    type: 'response.shell_call_command.delta';
    output_index: number;
    command_index: number;
    delta: string;
    obfuscation?: string;
  }
  | {
    type: 'response.shell_call_command.done';
    output_index: number;
    command_index: number;
    command: string;
  }
  // https://github.com/vercel/ai/blob/6b6a8bbe9247e0ed70c8a7f6e850a1ab16096528/packages/openai/src/responses/__fixtures__/openai-apply-patch-tool.1.chunks.txt#L4-L36
  | {
    type: 'response.apply_patch_call_operation_diff.delta';
    item_id: string;
    output_index: number;
    delta: string;
    obfuscation?: string;
  }
  | {
    type: 'response.apply_patch_call_operation_diff.done';
    item_id: string;
    output_index: number;
    diff: string;
  }
  // Native compaction progress carries no summary; the final encrypted item
  // arrives in output_item.done.
  // https://github.com/openai/openai-node/blob/02f4ef94e8b3b02b43af6516c71a74c3c7a80b5d/src/resources/responses/responses.ts#L2311-L2335
  | {
    type: 'response.compaction.compacting';
    item_id: string;
    output_index: number;
  }
  | { type: 'response.completed'; response: OpenAIResponsesResult }
  | { type: 'response.incomplete'; response: OpenAIResponsesResult }
  | { type: 'response.failed'; response: OpenAIResponsesResult }
  | {
    type: 'error';
    message?: string;
    code?: string | null;
    param?: string | null;
    error?: Record<string, unknown>;
  };

export const isOpenAIResponsesTerminalEvent = (event: Pick<OpenAIResponsesStreamEvent, 'type'>): boolean =>
  event.type === 'response.completed' || event.type === 'response.incomplete' || event.type === 'response.failed' || event.type === 'error';

export { parseOpenAIResponsesStream, type ParseOpenAIResponsesStreamOptions } from './stream.ts';
export { OPENAI_RESPONSES_MISSING_TERMINAL_MESSAGE, collectOpenAIResponsesProtocolEventsToResult } from './to-result.ts';
export { reassembleOpenAIResponsesEvents } from './reassemble.ts';
export { openaiResponsesProtocolFrameToSSEFrame } from './to-sse.ts';
