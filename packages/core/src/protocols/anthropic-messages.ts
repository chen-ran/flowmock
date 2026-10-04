import { asArray, IdOrdinals, isObject, iterate, nonEmpty, numberOrNull, opaqueDigest, type ProtocolAdapter, type ResponseSummary, stringOrNull, stripCacheControl } from './adapter.ts';
import type { WireFrame } from '../corpus/wire.ts';
import { type AnthropicMessagesStreamEvent, reassembleAnthropicMessagesEvents } from '@flowmock/protocols/anthropic-messages';

const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return asArray(value).map(block => (isObject(block) && typeof block.text === 'string' ? block.text : '')).join('');
};

const normalizeBlock = (block: unknown, ids: IdOrdinals): unknown => {
  if (!isObject(block)) return block;
  switch (block.type) {
  case 'text':
    return { type: 'text', text: block.text };
  case 'image':
  case 'document':
    return { type: block.type, source: opaqueDigest(isObject(block.source) ? (block.source.data ?? block.source.url) : block.source) };
  case 'tool_use':
  case 'server_tool_use':
    return { type: block.type, ref: ids.ref(block.id), name: block.name, input: block.input ?? null };
  case 'tool_result':
    return {
      type: 'tool_result',
      ref: ids.ref(block.tool_use_id),
      content: normalizeContent(block.content, ids),
      ...(block.is_error === true ? { is_error: true } : {}),
    };
  case 'thinking':
    // Signatures are minted per response; the thinking text identifies it.
    return { type: 'thinking', thinking: block.thinking };
  case 'redacted_thinking':
    return { type: 'redacted_thinking' };
  default: {
    const { id: _id, tool_use_id: toolUseId, ...rest } = stripCacheControl(block) as Record<string, unknown>;
    return toolUseId === undefined ? rest : { ...rest, ref: ids.ref(toolUseId) };
  }
  }
};

const normalizeContent = (content: unknown, ids: IdOrdinals): unknown[] =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : asArray(content).map(block => normalizeBlock(block, ids));

const countChars = (value: unknown): number => {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countChars(item), 0);
  if (isObject(value)) {
    if (typeof value.text === 'string') return value.text.length;
    if (typeof value.thinking === 'string') return value.thinking.length;
    if (value.content !== undefined) return countChars(value.content);
    if (value.input !== undefined) return JSON.stringify(value.input)?.length ?? 0;
  }
  return 0;
};

// Output-bearing deltas as Floway packages/gateway/src/data-plane/chat/shared/
// first-output-token.ts (MIT) classifies them. See NOTICE.md.
const deltaChars = (delta: Record<string, unknown>): number => {
  switch (delta.type) {
  case 'text_delta': return typeof delta.text === 'string' ? delta.text.length : 0;
  case 'thinking_delta': return typeof delta.thinking === 'string' ? delta.thinking.length : 0;
  case 'input_json_delta': return typeof delta.partial_json === 'string' ? delta.partial_json.length : 0;
  case 'citations_delta': return 1;
  default: return 0;
  }
};

const errorOf = (event: Record<string, unknown>): { type: string; message: string } | null => {
  if (event.type !== 'error') return null;
  const error = isObject(event.error) ? event.error : {};
  return { type: stringOrNull(error.type) ?? 'error', message: stringOrNull(error.message) ?? '' };
};

const summarizeStream = (frames: readonly WireFrame[]): ResponseSummary => {
  const summary: ResponseSummary = { stopReason: null, inputTokens: null, outputTokens: null, toolNames: [], reasoning: false, responseModel: null, error: null, terminated: false };
  for (const frame of frames) {
    const event = frame.json;
    if (!isObject(event)) continue;
    switch (event.type) {
    case 'message_start': {
      const message = isObject(event.message) ? event.message : {};
      summary.responseModel = stringOrNull(message.model);
      const usage = isObject(message.usage) ? message.usage : {};
      summary.inputTokens = numberOrNull(usage.input_tokens);
      summary.outputTokens = numberOrNull(usage.output_tokens);
      break;
    }
    case 'content_block_start': {
      const block = isObject(event.content_block) ? event.content_block : {};
      if (block.type === 'tool_use' && typeof block.name === 'string') summary.toolNames.push(block.name);
      if (block.type === 'thinking' || block.type === 'redacted_thinking') summary.reasoning = true;
      break;
    }
    case 'message_delta': {
      const delta = isObject(event.delta) ? event.delta : {};
      if (typeof delta.stop_reason === 'string') summary.stopReason = delta.stop_reason;
      const usage = isObject(event.usage) ? event.usage : {};
      summary.outputTokens = numberOrNull(usage.output_tokens) ?? summary.outputTokens;
      summary.inputTokens = numberOrNull(usage.input_tokens) ?? summary.inputTokens;
      break;
    }
    case 'message_stop':
      summary.terminated = true;
      break;
    case 'error':
      summary.error = errorOf(event);
      summary.terminated = true;
      break;
    }
  }
  return summary;
};

const summarizeBody = (body: unknown): ResponseSummary => {
  const message = isObject(body) ? body : {};
  if (message.type === 'error') {
    return { stopReason: null, inputTokens: null, outputTokens: null, toolNames: [], reasoning: false, responseModel: null, error: errorOf(message), terminated: true };
  }
  const usage = isObject(message.usage) ? message.usage : {};
  const content = asArray(message.content).filter(isObject);
  return {
    stopReason: stringOrNull(message.stop_reason),
    inputTokens: numberOrNull(usage.input_tokens),
    outputTokens: numberOrNull(usage.output_tokens),
    toolNames: content.filter(block => block.type === 'tool_use' && typeof block.name === 'string').map(block => block.name as string),
    reasoning: content.some(block => block.type === 'thinking' || block.type === 'redacted_thinking'),
    responseModel: stringOrNull(message.model),
    error: null,
    terminated: true,
  };
};

export const anthropicMessagesAdapter: ProtocolAdapter = {
  protocol: 'anthropic-messages',
  modelKey: 'model',
  timeKeys: [],

  normalizeRequest(body) {
    const payload = isObject(body) ? body : {};
    const ids = new IdOrdinals();
    const tools = asArray(payload.tools).filter(isObject);
    const header = {
      system: typeof payload.system === 'string' ? payload.system : textOf(payload.system),
      tools: tools.map(tool => stripCacheControl({ type: tool.type, name: tool.name, description: tool.description, input_schema: tool.input_schema })),
    };
    const messages = asArray(payload.messages).filter(isObject);
    const thinking = isObject(payload.thinking) ? payload.thinking : null;
    const outputConfig = isObject(payload.output_config) ? payload.output_config : null;
    return {
      model: stringOrNull(payload.model),
      stream: payload.stream === true,
      segments: [header, ...messages.map(message => ({ role: message.role, content: normalizeContent(message.content, ids) }))],
      features: {
        hasTools: tools.length > 0,
        toolNames: tools.flatMap(tool => (typeof tool.name === 'string' ? [tool.name] : [])),
        reasoningRequested: (thinking !== null && thinking.type !== 'disabled') || outputConfig?.effort !== undefined,
        inputChars: header.system.length + messages.reduce((sum, message) => sum + countChars(message.content), 0),
      },
    };
  },

  frameInfo(frame) {
    const event = frame.json;
    if (!isObject(event)) return { contentChars: 0, content: false, terminal: false, error: null };
    if (event.type === 'content_block_delta' && isObject(event.delta)) {
      const chars = deltaChars(event.delta);
      return { contentChars: chars, content: chars > 0, terminal: false, error: null };
    }
    return { contentChars: 0, content: false, terminal: event.type === 'message_stop' || event.type === 'error', error: errorOf(event) };
  },

  summarizeStream,
  summarizeBody,

  async collect(events) {
    return await reassembleAnthropicMessagesEvents(iterate(events as AnthropicMessagesStreamEvent[]));
  },

  encodeBody: body => JSON.stringify(body),

  sseEventName: event => (isObject(event) && typeof event.type === 'string' ? event.type : undefined),

  collectIds(event, into) {
    if (!isObject(event)) return;
    if (event.type === 'message_start' && isObject(event.message) && nonEmpty(event.message.id)) into.add(event.message.id);
    if (event.type === 'content_block_start' && isObject(event.content_block) && nonEmpty(event.content_block.id)) into.add(event.content_block.id);
    if (event.type === 'message' && nonEmpty(event.id)) {
      into.add(event.id);
      for (const block of asArray(event.content)) if (isObject(block) && nonEmpty(block.id)) into.add(block.id);
    }
  },

  errorEnvelope: (_status, type, message) => ({ type: 'error', error: { type, message } }),

  streamErrorEvent: (type, message) => ({ type: 'error', error: { type, message } }),
};
