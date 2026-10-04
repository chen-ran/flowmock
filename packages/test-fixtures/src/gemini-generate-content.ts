import { chunksFromEvents, type ExchangeFixture, googleJson, spread, sseBlock, type TimedEvent } from './builders.ts';

// `alt=sse` frames are CRLF-terminated `data:` blocks in Google's compact JSON
// spelling; the default stream is a pretty-printed JSON array whose elements
// are separated by `\n,\r\n`.
// https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent

const MODEL_VERSION = 'gemini-2.5-flash';

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'x-goog-request-id': 'gemini-req-0123456789',
  server: 'scaffolding on HTTPServer2',
};

const RESPONSE_ID = 'Rk3gaPXoKo2qz7IPkNrN-Ac';
const TEXT_PIECES = ['The sky', ' looks blue because', ' air scatters short', ' wavelengths more.'];

const sseEvents: TimedEvent[] = TEXT_PIECES.map((text, i) => {
  const last = i === TEXT_PIECES.length - 1;
  return {
    t: spread(TEXT_PIECES.length, 1460, 1720)[i],
    text: sseBlock(googleJson({
      candidates: [{
        content: { parts: [{ text }], role: 'model' },
        finishReason: last ? 'STOP' : undefined,
        index: 0,
      }],
      usageMetadata: last
        ? { promptTokenCount: 8, candidatesTokenCount: 16, totalTokenCount: 52, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 8 }], thoughtsTokenCount: 28 }
        : { promptTokenCount: 8, totalTokenCount: 8, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 8 }] },
      modelVersion: MODEL_VERSION,
      responseId: RESPONSE_ID,
    }), { lineEnd: '\r\n' }),
  };
});

export const geminiSseText: ExchangeFixture = {
  id: 'gemini-sse-text',
  protocol: 'gemini-generate-content',
  description: 'streamGenerateContent with alt=sse.',
  request: {
    method: 'POST',
    path: '/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': 'AIza-real-secret' },
    body: {
      contents: [{ role: 'user', parts: [{ text: 'Why is the sky blue?' }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
    },
  },
  response: { status: 200, headersAt: 1450, headers: SSE_HEADERS, chunks: chunksFromEvents(sseEvents) },
  expect: { outcome: 'ok', stream: true, stopReason: 'STOP', inputTokens: 8, outputTokens: 44, toolCalls: 0, reasoning: false, text: TEXT_PIECES.join('') },
};

const ARRAY_RESPONSE_ID = 'xQ3gaJbLHo-sz7IPw4fA0Q8';
const arrayElements = [
  {
    candidates: [{ content: { parts: [{ text: 'The user wants weather data.', thought: true }], role: 'model' }, index: 0 }],
    usageMetadata: { promptTokenCount: 40, totalTokenCount: 40 },
    modelVersion: MODEL_VERSION,
    responseId: ARRAY_RESPONSE_ID,
  },
  {
    candidates: [{
      content: { parts: [{ functionCall: { name: 'get_weather', args: { location: 'Paris' } }, thoughtSignature: 'CiQB0e2Kb0NmbWNhbGwtc2lnbmF0dXJl' }], role: 'model' },
      finishReason: 'STOP',
      index: 0,
    }],
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 15, totalTokenCount: 95, thoughtsTokenCount: 40 },
    modelVersion: MODEL_VERSION,
    responseId: ARRAY_RESPONSE_ID,
  },
];

const arrayEvents: TimedEvent[] = [
  { t: 2210, text: `[${JSON.stringify(arrayElements[0], null, 2)}` },
  { t: 2480, text: `\n,\r\n${JSON.stringify(arrayElements[1], null, 2)}` },
  { t: 2481, text: '\n]' },
];

export const geminiJsonArrayFunctionCall: ExchangeFixture = {
  id: 'gemini-json-array-function-call',
  protocol: 'gemini-generate-content',
  description: 'streamGenerateContent JSON array with a thought and a function call.',
  request: {
    method: 'POST',
    path: '/v1beta/models/gemini-2.5-flash:streamGenerateContent',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': 'AIza-real-secret' },
    body: {
      contents: [{ role: 'user', parts: [{ text: 'Weather in Paris?' }] }],
      tools: [{ functionDeclarations: [{ name: 'get_weather', description: 'Weather for a city.', parameters: { type: 'object', properties: { location: { type: 'string' } } } }] }],
      generationConfig: { thinkingConfig: { includeThoughts: true } },
    },
  },
  response: {
    status: 200,
    headersAt: 2200,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'x-goog-request-id': 'gemini-req-9876543210' },
    chunks: chunksFromEvents(arrayEvents),
  },
  expect: { outcome: 'ok', stream: true, stopReason: 'STOP', inputTokens: 40, outputTokens: 55, toolCalls: 1, reasoning: true },
};

export const geminiRateLimited: ExchangeFixture = {
  id: 'gemini-429',
  protocol: 'gemini-generate-content',
  description: 'HTTP 429 RESOURCE_EXHAUSTED.',
  request: {
    method: 'POST',
    path: '/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': 'AIza-real-secret' },
    body: { contents: [{ role: 'user', parts: [{ text: 'Hello again' }] }] },
  },
  response: {
    status: 429,
    headersAt: 140,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    chunks: [{
      t: 141,
      text: `${JSON.stringify({
        error: {
          code: 429,
          message: 'You exceeded your current quota, please check your plan and billing details.',
          status: 'RESOURCE_EXHAUSTED',
          details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }],
        },
      }, null, 2)}\n`,
    }],
  },
  expect: { outcome: 'http_error:429', stream: false, toolCalls: 0, reasoning: false },
};

const NON_STREAM_BODY = `${JSON.stringify({
  candidates: [{ content: { parts: [{ text: 'Paris.' }], role: 'model' }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 2, totalTokenCount: 8 },
  modelVersion: MODEL_VERSION,
  responseId: 'nOnStReAm0123456789AbC',
}, null, 2)}\n`;

export const geminiNonStream: ExchangeFixture = {
  id: 'gemini-non-stream',
  protocol: 'gemini-generate-content',
  description: 'generateContent JSON reply.',
  request: {
    method: 'POST',
    path: '/v1beta/models/gemini-2.5-flash:generateContent',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': 'AIza-real-secret' },
    body: { contents: [{ role: 'user', parts: [{ text: 'Capital of France?' }] }] },
  },
  response: {
    status: 200,
    headersAt: 640,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    chunks: [{ t: 641, text: NON_STREAM_BODY }],
  },
  expect: { outcome: 'ok', stream: false, stopReason: 'STOP', inputTokens: 6, outputTokens: 2, toolCalls: 0, reasoning: false, text: 'Paris.' },
};
