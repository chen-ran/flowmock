import { asArray, IdOrdinals, isObject, iterate, nonEmpty, numberOrNull, opaqueDigest, parsedArguments, type ProtocolAdapter, type ResponseSummary, stringOrNull } from './adapter.ts';
import type { WireFrame } from '../corpus/wire.ts';
import { type OpenAIResponsesStreamEvent, reassembleOpenAIResponsesEvents } from '@flowmock/protocols/openai-responses';

// Events that carry model output; the first one ends time-to-first-token.
// Derived from Floway packages/gateway/src/data-plane/chat/shared/
// first-output-token.ts (MIT). See NOTICE.md.
const OUTPUT_EVENT_TYPES = new Set([
  'response.output_text.delta',
  'response.function_call_arguments.delta',
  'response.custom_tool_call_input.delta',
  'response.refusal.delta',
  'response.reasoning_text.delta',
  'response.reasoning_summary_text.delta',
  'response.apply_patch_call_operation_diff.delta',
  'response.shell_call_command.delta',
]);

const TERMINAL_RESPONSE_TYPES = new Set(['response.completed', 'response.incomplete', 'response.failed']);

const normalizePart = (part: unknown): unknown => {
  if (typeof part === 'string') return { type: 'text', text: part };
  if (!isObject(part)) return part;
  switch (part.type) {
  case 'input_text':
  case 'output_text':
  case 'text':
    return { type: 'text', text: part.text };
  case 'refusal':
    return { type: 'refusal', refusal: part.refusal };
  case 'input_image':
    return { type: 'image', image: opaqueDigest(part.image_url ?? part.file_id) };
  case 'input_file':
    return { type: 'file', file: opaqueDigest(part.file_data ?? part.file_id ?? part.file_url) };
  default:
    return part;
  }
};

const normalizeContent = (content: unknown): unknown[] =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : asArray(content).map(normalizePart);

const normalizeOutput = (output: unknown): unknown => (typeof output === 'string' ? output : normalizeContent(output));

// Normalizes one input (or replayed output) item. Reasoning items carry
// per-response encrypted state and are dropped.
const normalizeItem = (item: unknown, ids: IdOrdinals): unknown => {
  if (!isObject(item)) return item;
  const type = item.type ?? (item.role === undefined ? undefined : 'message');
  switch (type) {
  case 'message':
    return { role: item.role === 'developer' ? 'system' : item.role, content: normalizeContent(item.content) };
  case 'function_call':
    return { type: 'function_call', ref: ids.ref(item.call_id), name: item.name, arguments: parsedArguments(item.arguments) };
  case 'function_call_output':
    return { type: 'function_call_output', ref: ids.ref(item.call_id), output: normalizeOutput(item.output) };
  case 'custom_tool_call':
    return { type: 'custom_tool_call', ref: ids.ref(item.call_id), name: item.name, input: item.input };
  case 'custom_tool_call_output':
    return { type: 'custom_tool_call_output', ref: ids.ref(item.call_id), output: normalizeOutput(item.output) };
  case 'reasoning':
    return null;
  default: {
    const { id: _id, status: _status, call_id: callId, ...rest } = item;
    return callId === undefined ? rest : { ...rest, ref: ids.ref(callId) };
  }
  }
};

const inputItems = (input: unknown): unknown[] => (typeof input === 'string' ? [{ role: 'user', content: input }] : asArray(input));

const itemChars = (item: unknown): number => {
  if (!isObject(item)) return 0;
  const content = item.content ?? item.output;
  if (typeof content === 'string') return content.length;
  return asArray(content).reduce<number>((sum, part) => sum + (isObject(part) && typeof part.text === 'string' ? part.text.length : 0), 0);
};

const terminalResponse = (frames: readonly WireFrame[]): Record<string, unknown> | null => {
  for (let index = frames.length - 1; index >= 0; index--) {
    const event = frames[index].json;
    if (isObject(event) && typeof event.type === 'string' && TERMINAL_RESPONSE_TYPES.has(event.type) && isObject(event.response)) return event.response;
  }
  return null;
};

const summarizeResponse = (response: Record<string, unknown>): ResponseSummary => {
  const usage = isObject(response.usage) ? response.usage : {};
  const output = asArray(response.output).filter(isObject);
  const error = isObject(response.error) ? response.error : null;
  return {
    stopReason: stringOrNull(response.status),
    inputTokens: numberOrNull(usage.input_tokens),
    outputTokens: numberOrNull(usage.output_tokens),
    toolNames: output.filter(item => (item.type === 'function_call' || item.type === 'custom_tool_call') && typeof item.name === 'string').map(item => item.name as string),
    reasoning: output.some(item => item.type === 'reasoning'),
    responseModel: stringOrNull(response.model),
    error: error ? { type: stringOrNull(error.code) ?? stringOrNull(error.type) ?? 'error', message: stringOrNull(error.message) ?? '' } : null,
    terminated: true,
  };
};

const errorEventInfo = (event: Record<string, unknown>): { type: string; message: string } => {
  const nested = isObject(event.error) ? event.error : {};
  return {
    type: stringOrNull(event.code) ?? stringOrNull(nested.code) ?? stringOrNull(nested.type) ?? 'error',
    message: stringOrNull(event.message) ?? stringOrNull(nested.message) ?? '',
  };
};

const emptySummary = (): ResponseSummary => ({ stopReason: null, inputTokens: null, outputTokens: null, toolNames: [], reasoning: false, responseModel: null, error: null, terminated: false });

export const openaiResponsesAdapter: ProtocolAdapter & {
  conversationItems(body: unknown, history: readonly unknown[] | null | undefined): unknown[];
  outputItems(response: unknown): unknown[];
  terminalResponse(frames: readonly WireFrame[]): Record<string, unknown> | null;
} = {
  protocol: 'openai-responses',
  modelKey: 'model',
  timeKeys: ['created_at', 'completed_at'],

  // The full raw item list a request stands for: a `previous_response_id`
  // continuation expands to the remembered conversation plus the new input.
  conversationItems(body, history) {
    const payload = isObject(body) ? body : {};
    const items = inputItems(payload.input);
    return history ? [...history, ...items] : items;
  },

  outputItems: response => (isObject(response) ? asArray(response.output) : []),

  terminalResponse,

  normalizeRequest(body, context) {
    const payload = isObject(body) ? body : {};
    const ids = new IdOrdinals();
    const tools = asArray(payload.tools).filter(isObject);
    const toolDefs = tools.map(tool => ({ type: tool.type, name: tool.name, description: tool.description, parameters: tool.parameters ?? tool.format }));
    const previous = stringOrNull(payload.previous_response_id);
    const items = this.conversationItems(body, context?.history);
    const header = {
      instructions: stringOrNull(payload.instructions) ?? '',
      tools: toolDefs,
      ...(previous !== null && !context?.history ? { previous_response: 'unresolved' } : {}),
    };
    const reasoning = isObject(payload.reasoning) ? payload.reasoning : null;
    return {
      model: stringOrNull(payload.model),
      // The WebSocket transport always streams; HTTP streams on request.
      stream: payload.stream === true,
      segments: [header, ...items.map(item => normalizeItem(item, ids)).filter(segment => segment !== null)],
      features: {
        hasTools: tools.length > 0,
        toolNames: toolDefs.flatMap(tool => (typeof tool.name === 'string' ? [tool.name] : [])),
        reasoningRequested: reasoning !== null && typeof reasoning.effort === 'string' && reasoning.effort !== 'none',
        inputChars: header.instructions.length + items.reduce<number>((sum, item) => sum + itemChars(item), 0),
      },
    };
  },

  frameInfo(frame) {
    const event = frame.json;
    if (!isObject(event) || typeof event.type !== 'string') return { contentChars: 0, content: false, terminal: false, error: null };
    if (OUTPUT_EVENT_TYPES.has(event.type)) {
      const chars = typeof event.delta === 'string' ? event.delta.length : 0;
      return { contentChars: chars, content: chars > 0, terminal: false, error: null };
    }
    if (event.type === 'error') return { contentChars: 0, content: false, terminal: true, error: errorEventInfo(event) };
    if (TERMINAL_RESPONSE_TYPES.has(event.type)) {
      const response = isObject(event.response) ? event.response : {};
      const error = event.type === 'response.failed' ? summarizeResponse(response).error ?? { type: 'failed', message: '' } : null;
      return { contentChars: 0, content: false, terminal: true, error };
    }
    return { contentChars: 0, content: false, terminal: false, error: null };
  },

  summarizeStream(frames) {
    const response = terminalResponse(frames);
    if (response) return summarizeResponse(response);
    const summary = emptySummary();
    for (const frame of frames) {
      const event = frame.json;
      if (!isObject(event)) continue;
      if (isObject(event.response)) summary.responseModel = stringOrNull(event.response.model) ?? summary.responseModel;
      if (event.type === 'error') {
        summary.error = errorEventInfo(event);
        summary.terminated = true;
      }
      if (event.type === 'response.output_item.added' && isObject(event.item)) {
        if (event.item.type === 'reasoning') summary.reasoning = true;
        if ((event.item.type === 'function_call' || event.item.type === 'custom_tool_call') && typeof event.item.name === 'string') summary.toolNames.push(event.item.name);
      }
    }
    return summary;
  },

  summarizeBody(body) {
    if (!isObject(body)) return { ...emptySummary(), terminated: true };
    if (isObject(body.error) && body.object !== 'response') return { ...emptySummary(), error: errorEventInfo(body), terminated: true };
    return summarizeResponse(body);
  },

  async collect(events) {
    return await reassembleOpenAIResponsesEvents(iterate(events as OpenAIResponsesStreamEvent[]));
  },

  encodeBody: body => JSON.stringify(body),

  sseEventName: event => (isObject(event) && typeof event.type === 'string' ? event.type : undefined),

  collectIds(event, into) {
    if (!isObject(event)) return;
    const addResponse = (response: unknown) => {
      if (!isObject(response)) return;
      if (nonEmpty(response.id)) into.add(response.id);
      for (const item of asArray(response.output)) addItem(item);
    };
    const addItem = (item: unknown) => {
      if (!isObject(item)) return;
      if (nonEmpty(item.id)) into.add(item.id);
      if (nonEmpty(item.call_id)) into.add(item.call_id);
    };
    if (event.object === 'response') addResponse(event);
    addResponse(event.response);
    addItem(event.item);
  },

  errorEnvelope: (_status, type, message) => ({ error: { message, type, param: null, code: type } }),

  streamErrorEvent: (type, message) => ({ type: 'error', code: type, message, param: null }),
};
