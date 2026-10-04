import { asArray, isObject, iterate, nonEmpty, numberOrNull, opaqueDigest, type ProtocolAdapter, type ResponseSummary, stringOrNull } from './adapter.ts';
import type { WireFrame } from '../corpus/wire.ts';
import { type GeminiGenerateContentStreamEvent, reassembleGeminiGenerateContentEvents } from '@flowmock/protocols/gemini-generate-content';

const normalizePart = (part: unknown): unknown => {
  if (!isObject(part)) return part;
  if (typeof part.text === 'string') return part.thought === true ? null : { text: part.text };
  if (isObject(part.functionCall)) return { functionCall: { name: part.functionCall.name, args: part.functionCall.args ?? {} } };
  if (isObject(part.functionResponse)) return { functionResponse: { name: part.functionResponse.name, response: part.functionResponse.response ?? null } };
  if (isObject(part.inlineData)) return { inlineData: opaqueDigest(part.inlineData.data) };
  if (isObject(part.fileData)) return { fileData: part.fileData.fileUri };
  const { thoughtSignature: _signature, ...rest } = part;
  return rest;
};

const normalizeParts = (parts: unknown): unknown[] => asArray(parts).map(normalizePart).filter(part => part !== null);

const partsText = (parts: unknown): string => asArray(parts).map(part => (isObject(part) && typeof part.text === 'string' ? part.text : '')).join('');

const candidatesOf = (event: unknown): Record<string, unknown>[] => (isObject(event) ? asArray(event.candidates).filter(isObject) : []);

const partsOf = (candidate: Record<string, unknown>): Record<string, unknown>[] =>
  (isObject(candidate.content) ? asArray(candidate.content.parts).filter(isObject) : []);

const errorOf = (event: unknown): { type: string; message: string } | null => {
  if (!isObject(event) || !isObject(event.error)) return null;
  return { type: stringOrNull(event.error.status) ?? String(event.error.code ?? 'error'), message: stringOrNull(event.error.message) ?? '' };
};

const outputTokens = (usage: Record<string, unknown>): number | null => {
  const candidates = numberOrNull(usage.candidatesTokenCount);
  const thoughts = numberOrNull(usage.thoughtsTokenCount);
  return candidates === null && thoughts === null ? null : (candidates ?? 0) + (thoughts ?? 0);
};

const accumulate = (summary: ResponseSummary, event: unknown): void => {
  const error = errorOf(event);
  if (error) {
    summary.error = error;
    summary.terminated = true;
    return;
  }
  if (!isObject(event)) return;
  summary.responseModel = stringOrNull(event.modelVersion) ?? summary.responseModel;
  if (isObject(event.usageMetadata)) {
    summary.inputTokens = numberOrNull(event.usageMetadata.promptTokenCount) ?? summary.inputTokens;
    summary.outputTokens = outputTokens(event.usageMetadata) ?? summary.outputTokens;
  }
  for (const candidate of candidatesOf(event)) {
    if (typeof candidate.finishReason === 'string') {
      summary.stopReason = candidate.finishReason;
      summary.terminated = true;
    }
    for (const part of partsOf(candidate)) {
      if (part.thought === true) summary.reasoning = true;
      if (isObject(part.functionCall) && typeof part.functionCall.name === 'string') summary.toolNames.push(part.functionCall.name);
    }
  }
};

const emptySummary = (): ResponseSummary => ({ stopReason: null, inputTokens: null, outputTokens: null, toolNames: [], reasoning: false, responseModel: null, error: null, terminated: false });

export const geminiGenerateContentAdapter: ProtocolAdapter = {
  protocol: 'gemini-generate-content',
  modelKey: 'modelVersion',
  timeKeys: [],

  normalizeRequest(body, context) {
    const payload = isObject(body) ? body : {};
    const toolGroups = asArray(payload.tools).filter(isObject);
    const declarations = toolGroups.flatMap(group => asArray(group.functionDeclarations).filter(isObject));
    const systemInstruction = isObject(payload.systemInstruction) ? partsText(payload.systemInstruction.parts) : '';
    const contents = asArray(payload.contents).filter(isObject);
    const generationConfig = isObject(payload.generationConfig) ? payload.generationConfig : {};
    const thinking = isObject(generationConfig.thinkingConfig) ? generationConfig.thinkingConfig : null;
    return {
      model: context?.pathModel ?? null,
      stream: context?.pathStream === true,
      segments: [
        {
          systemInstruction,
          tools: toolGroups.map(group => Object.fromEntries(Object.entries(group).map(([key, value]) => [
            key,
            key === 'functionDeclarations'
              ? asArray(value).filter(isObject).map(declaration => ({ name: declaration.name, description: declaration.description, parameters: declaration.parameters ?? declaration.parametersJsonSchema }))
              : value,
          ]))),
        },
        ...contents.map(content => ({ role: content.role ?? 'user', parts: normalizeParts(content.parts) })),
      ],
      features: {
        hasTools: toolGroups.length > 0,
        toolNames: declarations.flatMap(declaration => (typeof declaration.name === 'string' ? [declaration.name] : [])),
        reasoningRequested: thinking !== null && (thinking.includeThoughts === true || (typeof thinking.thinkingBudget === 'number' && thinking.thinkingBudget > 0) || typeof thinking.thinkingLevel === 'string'),
        inputChars: systemInstruction.length + contents.reduce((sum, content) => sum + partsText(content.parts).length, 0),
      },
    };
  },

  frameInfo(frame) {
    const event = frame.json;
    const error = errorOf(event);
    if (error) return { contentChars: 0, content: false, terminal: true, error };
    let chars = 0;
    let terminal = false;
    for (const candidate of candidatesOf(event)) {
      if (typeof candidate.finishReason === 'string') terminal = true;
      for (const part of partsOf(candidate)) {
        if (typeof part.text === 'string') chars += part.text.length;
        if (isObject(part.functionCall)) chars += String(part.functionCall.name ?? '').length + (JSON.stringify(part.functionCall.args ?? {})?.length ?? 0);
      }
    }
    return { contentChars: chars, content: chars > 0, terminal, error: null };
  },

  summarizeStream(frames: readonly WireFrame[]) {
    const summary = emptySummary();
    for (const frame of frames) accumulate(summary, frame.json);
    return summary;
  },

  summarizeBody(body) {
    const summary = emptySummary();
    // A non-streaming error may also arrive wrapped in a one-element array.
    for (const event of Array.isArray(body) ? body : [body]) accumulate(summary, event);
    summary.terminated = true;
    return summary;
  },

  async collect(events) {
    return await reassembleGeminiGenerateContentEvents(iterate(events as GeminiGenerateContentStreamEvent[]));
  },

  encodeBody: body => `${JSON.stringify(body, null, 2)}\n`,

  sseEventName: () => undefined,

  collectIds(event, into) {
    if (!isObject(event)) return;
    if (nonEmpty(event.responseId)) into.add(event.responseId);
    for (const candidate of candidatesOf(event)) {
      for (const part of partsOf(candidate)) if (isObject(part.functionCall) && nonEmpty(part.functionCall.id)) into.add(part.functionCall.id);
    }
  },

  errorEnvelope: (status, type, message) => ({ error: { code: status, message, status: type } }),

  streamErrorEvent: (type, message) => ({ error: { code: 500, message, status: type } }),
};
