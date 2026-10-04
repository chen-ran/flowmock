import { chunksFromEvents, type ExchangeFixture, spread, sseBlock, type TimedEvent } from './builders.ts';

// Chunk shapes follow the Chat Completions streaming reference, including the
// trailing usage-only chunk `stream_options.include_usage` asks for.
// https://platform.openai.com/docs/api-reference/chat-streaming

const MODEL = 'gpt-4o-mini-2024-07-18';
const CREATED = 1759550400;

const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'openai-processing-ms': '214',
  'x-request-id': 'req_9b7c1f6a0a2e4f0c8d1e2f3a4b5c6d7e',
  'x-ratelimit-remaining-requests': '9999',
};

const chunk = (id: string, choices: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  object: 'chat.completion.chunk',
  created: CREATED,
  model: MODEL,
  service_tier: 'default',
  system_fingerprint: 'fp_560af6e559',
  choices,
  ...extra,
});

const data = (t: number, value: unknown): TimedEvent => ({ t, text: sseBlock(JSON.stringify(value)) });
const done = (t: number): TimedEvent => ({ t, text: sseBlock('[DONE]') });

const TEXT_ID = 'chatcmpl-AbCdEf0123456789GhIjKlMnOpQr';
const TEXT_PIECES = ['Hello', '!', ' How', ' can', ' I', ' help', '?'];

const textEvents: TimedEvent[] = [
  data(388, chunk(TEXT_ID, [{ index: 0, delta: { role: 'assistant', content: '', refusal: null }, logprobs: null, finish_reason: null }], { usage: null })),
  ...TEXT_PIECES.map((content, i) => data(spread(TEXT_PIECES.length, 391, 470)[i], chunk(TEXT_ID, [{ index: 0, delta: { content }, logprobs: null, finish_reason: null }], { usage: null }))),
  data(476, chunk(TEXT_ID, [{ index: 0, delta: {}, logprobs: null, finish_reason: 'stop' }], { usage: null })),
  data(479, chunk(TEXT_ID, [], {
    usage: {
      prompt_tokens: 9,
      completion_tokens: 8,
      total_tokens: 17,
      prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0, audio_tokens: 0, accepted_prediction_tokens: 0, rejected_prediction_tokens: 0 },
    },
  })),
  done(479),
];

export const chatText: ExchangeFixture = {
  id: 'chat-text',
  protocol: 'openai-chat-completions',
  description: 'Plain streamed text with a trailing usage chunk.',
  request: {
    method: 'POST',
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: {
      model: 'gpt-4o-mini',
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2,
      messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hello!' }],
    },
  },
  response: { status: 200, headersAt: 380, headers: HEADERS, chunks: chunksFromEvents(textEvents) },
  expect: {
    outcome: 'ok',
    stream: true,
    stopReason: 'stop',
    inputTokens: 9,
    outputTokens: 8,
    toolCalls: 0,
    reasoning: false,
    text: TEXT_PIECES.join(''),
  },
};

const TOOL_ID = 'chatcmpl-ToOlCaLl0123456789AbCdEfGhIj';
const CALLS = [
  { id: 'call_DdmO9pD3xa9XTPNJ32zg2hcA', name: 'get_weather', args: ['{"', 'location', '":"', 'Paris', '"}'] },
  { id: 'call_7xKp2Nn4Ww9eE3rT5yU8iO0p', name: 'get_time', args: ['{"', 'tz', '":"', 'Europe/Paris', '"}'] },
];

const toolEvents: TimedEvent[] = [
  data(610, chunk(TOOL_ID, [{ index: 0, delta: { role: 'assistant', content: null, refusal: null }, logprobs: null, finish_reason: null }])),
  ...CALLS.flatMap((call, callIndex) => {
    const base = 640 + callIndex * 120;
    return [
      data(base, chunk(TOOL_ID, [{ index: 0, delta: { tool_calls: [{ index: callIndex, id: call.id, type: 'function', function: { name: call.name, arguments: '' } }] }, logprobs: null, finish_reason: null }])),
      ...call.args.map((args, i) => data(spread(call.args.length, base + 10, base + 100)[i], chunk(TOOL_ID, [{ index: 0, delta: { tool_calls: [{ index: callIndex, function: { arguments: args } }] }, logprobs: null, finish_reason: null }]))),
    ];
  }),
  data(870, chunk(TOOL_ID, [{ index: 0, delta: {}, logprobs: null, finish_reason: 'tool_calls' }])),
  done(870),
];

export const chatToolCalls: ExchangeFixture = {
  id: 'chat-tool-calls',
  protocol: 'openai-chat-completions',
  description: 'Two parallel tool calls, no usage chunk.',
  request: {
    method: 'POST',
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: {
      model: 'gpt-4o-mini',
      stream: true,
      tools: [
        { type: 'function', function: { name: 'get_weather', parameters: { type: 'object', properties: { location: { type: 'string' } } } } },
        { type: 'function', function: { name: 'get_time', parameters: { type: 'object', properties: { tz: { type: 'string' } } } } },
      ],
      messages: [{ role: 'user', content: 'Weather and time in Paris?' }],
    },
  },
  response: { status: 200, headersAt: 600, headers: HEADERS, chunks: chunksFromEvents(toolEvents) },
  expect: { outcome: 'ok', stream: true, stopReason: 'tool_calls', toolCalls: 2, reasoning: false },
};

const ERROR_ID = 'chatcmpl-ErRoRmId0123456789AbCdEfGh';

const errorEvents: TimedEvent[] = [
  data(420, chunk(ERROR_ID, [{ index: 0, delta: { role: 'assistant', content: '' }, logprobs: null, finish_reason: null }])),
  data(450, chunk(ERROR_ID, [{ index: 0, delta: { content: 'Partial' }, logprobs: null, finish_reason: null }])),
  data(1450, { error: { message: 'The server had an error while processing your request. Sorry about that!', type: 'server_error', param: null, code: null } }),
];

export const chatErrorChunk: ExchangeFixture = {
  id: 'chat-error-chunk',
  protocol: 'openai-chat-completions',
  description: 'Stream that ends with an in-band error object.',
  request: {
    method: 'POST',
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: { model: 'gpt-4o-mini', stream: true, messages: [{ role: 'user', content: 'Write a poem' }] },
  },
  response: { status: 200, headersAt: 410, headers: HEADERS, chunks: chunksFromEvents(errorEvents) },
  expect: { outcome: 'stream_error:server_error', stream: true, stopReason: null, toolCalls: 0, reasoning: false, text: 'Partial' },
};

export const chatRateLimited: ExchangeFixture = {
  id: 'chat-429',
  protocol: 'openai-chat-completions',
  description: 'HTTP 429 rate_limit_exceeded.',
  request: {
    method: 'POST',
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: { model: 'gpt-4o-mini', stream: true, messages: [{ role: 'user', content: 'Hello again' }] },
  },
  response: {
    status: 429,
    headersAt: 61,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': 'req_ratelimited0123456789abcdef',
      'x-ratelimit-limit-tokens': '200000',
      'x-ratelimit-remaining-tokens': '0',
      'x-ratelimit-reset-tokens': '108ms',
      'retry-after': '1',
    },
    chunks: [{
      t: 62,
      text: `${JSON.stringify({
        error: {
          message: 'Rate limit reached for gpt-4o-mini in organization org-abc on tokens per min (TPM): Limit 200000, Used 199850, Requested 512. Please try again in 108ms.',
          type: 'tokens',
          param: null,
          code: 'rate_limit_exceeded',
        },
      }, null, 4)}\n`,
    }],
  },
  expect: { outcome: 'http_error:429', stream: false, toolCalls: 0, reasoning: false },
};

const NON_STREAM_BODY = `${JSON.stringify({
  id: 'chatcmpl-NoNsTrEaM0123456789AbCdEfGh',
  object: 'chat.completion',
  created: CREATED,
  model: MODEL,
  choices: [{ index: 0, message: { role: 'assistant', content: 'Paris.', refusal: null, annotations: [] }, logprobs: null, finish_reason: 'stop' }],
  usage: { prompt_tokens: 14, completion_tokens: 2, total_tokens: 16 },
  service_tier: 'default',
  system_fingerprint: 'fp_560af6e559',
}, null, 2)}\n`;

export const chatNonStream: ExchangeFixture = {
  id: 'chat-non-stream',
  protocol: 'openai-chat-completions',
  description: 'Non-streaming JSON reply.',
  request: {
    method: 'POST',
    path: '/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Capital of France?' }] },
  },
  response: {
    status: 200,
    headersAt: 702,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_nonstream0123456789abcdef' },
    chunks: [{ t: 703, text: NON_STREAM_BODY }],
  },
  expect: { outcome: 'ok', stream: false, stopReason: 'stop', inputTokens: 14, outputTokens: 2, toolCalls: 0, reasoning: false, text: 'Paris.' },
};
