import { asArray, IdOrdinals, isObject, iterate, nonEmpty, numberOrNull, opaqueDigest, parsedArguments, type ProtocolAdapter, type ResponseSummary, stringOrNull } from './adapter.ts';
import type { WireFrame } from '../corpus/wire.ts';
import { type OpenAIChatCompletionsStreamEvent, openaiChatCompletionsErrorPayloadMessage, reassembleOpenAIChatCompletionsEvents } from '@flowmock/protocols/openai-chat-completions';

// Output detection follows Floway packages/gateway/src/data-plane/chat/shared/
// first-output-token.ts (MIT). See NOTICE.md.
//
// Vendor spellings of the reasoning delta. `reasoning_text` is Copilot's,
// `reasoning_content` DeepSeek/vLLM's, `reasoning` OpenRouter's.
const REASONING_KEYS = ['reasoning_text', 'reasoning_content', 'reasoning'] as const;

const normalizePart = (part: unknown): unknown => {
  if (typeof part === 'string') return { type: 'text', text: part };
  if (!isObject(part)) return part;
  if (part.type === 'text') return { type: 'text', text: part.text };
  if (part.type === 'image_url') return { type: 'image', url: opaqueDigest(isObject(part.image_url) ? part.image_url.url : part.image_url) };
  if (part.type === 'input_audio' || part.type === 'file') return { type: part.type, data: opaqueDigest(part) };
  return part;
};

const normalizeContent = (content: unknown): unknown[] =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : asArray(content).map(normalizePart);

const contentChars = (content: unknown): number =>
  typeof content === 'string'
    ? content.length
    : asArray(content).reduce<number>((sum, part) => sum + (isObject(part) && typeof part.text === 'string' ? part.text.length : 0), 0);

const errorOf = (event: unknown): { type: string; message: string } | null => {
  if (!isObject(event) || !isObject(event.error)) return null;
  const error = event.error;
  const type = stringOrNull(error.type) ?? (error.code == null ? null : String(error.code)) ?? 'error';
  return { type, message: stringOrNull(error.message) ?? openaiChatCompletionsErrorPayloadMessage(event) ?? '' };
};

const choiceChars = (choice: Record<string, unknown>): number => {
  const delta = isObject(choice.delta) ? choice.delta : {};
  let chars = typeof delta.content === 'string' ? delta.content.length : 0;
  if (typeof delta.refusal === 'string') chars += delta.refusal.length;
  for (const key of REASONING_KEYS) if (typeof delta[key] === 'string') chars += (delta[key] as string).length;
  for (const call of asArray(delta.tool_calls)) {
    if (!isObject(call) || !isObject(call.function)) continue;
    if (typeof call.function.name === 'string') chars += call.function.name.length;
    if (typeof call.function.arguments === 'string') chars += call.function.arguments.length;
  }
  return chars;
};

const summarizeStream = (frames: readonly WireFrame[]): ResponseSummary => {
  const summary: ResponseSummary = { stopReason: null, inputTokens: null, outputTokens: null, toolNames: [], reasoning: false, responseModel: null, error: null, terminated: false };
  const toolNames = new Map<number, string>();
  for (const frame of frames) {
    if (frame.done) {
      summary.terminated = true;
      continue;
    }
    const event = frame.json;
    if (!isObject(event)) continue;
    const error = errorOf(event);
    if (error) {
      summary.error = error;
      summary.terminated = true;
      continue;
    }
    summary.responseModel ??= stringOrNull(event.model);
    if (isObject(event.usage)) {
      summary.inputTokens = numberOrNull(event.usage.prompt_tokens) ?? summary.inputTokens;
      summary.outputTokens = numberOrNull(event.usage.completion_tokens) ?? summary.outputTokens;
    }
    for (const choice of asArray(event.choices).filter(isObject)) {
      if (typeof choice.finish_reason === 'string') summary.stopReason = choice.finish_reason;
      const delta = isObject(choice.delta) ? choice.delta : {};
      if (REASONING_KEYS.some(key => nonEmpty(delta[key]))) summary.reasoning = true;
      for (const call of asArray(delta.tool_calls).filter(isObject)) {
        const index = typeof call.index === 'number' ? call.index : toolNames.size;
        if (isObject(call.function) && typeof call.function.name === 'string' && !toolNames.has(index)) toolNames.set(index, call.function.name);
      }
    }
  }
  summary.toolNames = [...toolNames.entries()].sort(([left], [right]) => left - right).map(([, name]) => name);
  // Upstreams that skip `[DONE]` still end every choice with a finish reason.
  if (!summary.terminated && summary.stopReason !== null) summary.terminated = true;
  return summary;
};

const summarizeBody = (body: unknown): ResponseSummary => {
  const error = errorOf(body);
  if (error) return { stopReason: null, inputTokens: null, outputTokens: null, toolNames: [], reasoning: false, responseModel: null, error, terminated: true };
  const completion = isObject(body) ? body : {};
  const usage = isObject(completion.usage) ? completion.usage : {};
  const choices = asArray(completion.choices).filter(isObject);
  const messages = choices.map(choice => (isObject(choice.message) ? choice.message : {}));
  return {
    stopReason: stringOrNull(choices[0]?.finish_reason),
    inputTokens: numberOrNull(usage.prompt_tokens),
    outputTokens: numberOrNull(usage.completion_tokens),
    toolNames: messages.flatMap(message => asArray(message.tool_calls).filter(isObject).flatMap(call => (isObject(call.function) && typeof call.function.name === 'string' ? [call.function.name] : []))),
    reasoning: messages.some(message => REASONING_KEYS.some(key => nonEmpty(message[key]))),
    responseModel: stringOrNull(completion.model),
    error: null,
    terminated: true,
  };
};

export const openaiChatCompletionsAdapter: ProtocolAdapter = {
  protocol: 'openai-chat-completions',
  modelKey: 'model',
  timeKeys: ['created'],

  normalizeRequest(body) {
    const payload = isObject(body) ? body : {};
    const ids = new IdOrdinals();
    const tools = asArray(payload.tools).filter(isObject);
    const toolDefs = tools.map(tool => {
      const fn = isObject(tool.function) ? tool.function : {};
      return { type: tool.type, name: fn.name, description: fn.description, parameters: fn.parameters };
    });
    const messages = asArray(payload.messages).filter(isObject);
    return {
      model: stringOrNull(payload.model),
      stream: payload.stream === true,
      segments: [
        { tools: toolDefs },
        ...messages.map(message => ({
          // Clients swap `developer` and `system` freely for the same prompt.
          role: message.role === 'developer' ? 'system' : message.role,
          content: message.content == null ? [] : normalizeContent(message.content),
          ...(message.tool_calls === undefined ? {} : {
            tool_calls: asArray(message.tool_calls).filter(isObject).map(call => {
              const fn = isObject(call.function) ? call.function : {};
              return { ref: ids.ref(call.id), name: fn.name, arguments: parsedArguments(fn.arguments) };
            }),
          }),
          ...(message.tool_call_id === undefined ? {} : { ref: ids.ref(message.tool_call_id) }),
        })),
      ],
      features: {
        hasTools: tools.length > 0,
        toolNames: toolDefs.flatMap(tool => (typeof tool.name === 'string' ? [tool.name] : [])),
        reasoningRequested: typeof payload.reasoning_effort === 'string' && payload.reasoning_effort !== 'none',
        inputChars: messages.reduce((sum, message) => sum + contentChars(message.content), 0),
      },
    };
  },

  frameInfo(frame) {
    if (frame.done) return { contentChars: 0, content: false, terminal: true, error: null };
    const event = frame.json;
    const error = errorOf(event);
    if (error) return { contentChars: 0, content: false, terminal: true, error };
    if (!isObject(event)) return { contentChars: 0, content: false, terminal: false, error: null };
    const choices = asArray(event.choices).filter(isObject);
    const chars = choices.reduce((sum, choice) => sum + choiceChars(choice), 0);
    return { contentChars: chars, content: chars > 0, terminal: false, error: null };
  },

  summarizeStream,
  summarizeBody: body => summarizeBody(body),

  async collect(events) {
    return await reassembleOpenAIChatCompletionsEvents(iterate(events as OpenAIChatCompletionsStreamEvent[]));
  },

  encodeBody: body => JSON.stringify(body),

  sseEventName: () => undefined,

  collectIds(event, into) {
    if (!isObject(event)) return;
    if (nonEmpty(event.id)) into.add(event.id);
    for (const choice of asArray(event.choices).filter(isObject)) {
      const carrier = isObject(choice.delta) ? choice.delta : isObject(choice.message) ? choice.message : {};
      for (const call of asArray(carrier.tool_calls)) if (isObject(call) && nonEmpty(call.id)) into.add(call.id);
    }
  },

  errorEnvelope: (_status, type, message) => ({ error: { message, type, param: null, code: type } }),

  streamErrorEvent: (type, message) => ({ error: { message, type, param: null, code: null } }),
};
