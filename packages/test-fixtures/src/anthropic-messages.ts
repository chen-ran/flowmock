import { chunksFromEvents, type ExchangeFixture, spread, sseBlock, type TimedEvent } from './builders.ts';

// Shapes follow Anthropic's documented stream, including the spaced
// `{"type": "ping"}` body the API actually sends.
// https://docs.anthropic.com/en/docs/build-with-claude/streaming

const MODEL = 'claude-sonnet-4-5-20250929';

const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache',
  'request-id': 'req_011CTxF1y8yqAbcdeFghijkl',
  'anthropic-organization-id': '7e1c6f0a-1111-2222-3333-444455556666',
};

const event = (t: number, type: string, data: unknown): TimedEvent => ({ t, text: sseBlock(JSON.stringify(data), { event: type }) });

const messageStart = (t: number, id: string, inputTokens: number): TimedEvent => event(t, 'message_start', {
  type: 'message_start',
  message: {
    id,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 1,
      service_tier: 'standard',
    },
  },
});

const ping = (t: number): TimedEvent => ({ t, text: sseBlock('{"type": "ping"}', { event: 'ping' }) });

const textDeltas = (index: number, pieces: readonly string[], times: readonly number[]): TimedEvent[] =>
  pieces.map((text, i) => event(times[i], 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }));

const blockStop = (t: number, index: number): TimedEvent => event(t, 'content_block_stop', { type: 'content_block_stop', index });

const messageEnd = (t: number, stopReason: string, outputTokens: number): TimedEvent[] => [
  event(t, 'message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } }),
  event(t, 'message_stop', { type: 'message_stop' }),
];

const TEXT_PIECES = ['Hello', '! How', ' can I', ' help you', ' today?'];

const textEvents: TimedEvent[] = [
  messageStart(412, 'msg_01XFDUDYJgAACzvnptvVoYEL', 12),
  event(412, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  ping(412),
  ...textDeltas(0, TEXT_PIECES, [905, 931, 958, 990, 1012]),
  blockStop(1030, 0),
  ...messageEnd(1030, 'end_turn', 12),
];

export const anthropicText: ExchangeFixture = {
  id: 'anthropic-text',
  protocol: 'anthropic-messages',
  description: 'Plain streamed text reply.',
  request: {
    method: 'POST',
    path: '/v1/messages',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant-real-secret' },
    body: {
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      stream: true,
      temperature: 0.7,
      metadata: { user_id: 'user-1' },
      messages: [{ role: 'user', content: 'Say hello' }],
    },
  },
  response: { status: 200, headersAt: 405, headers: HEADERS, chunks: chunksFromEvents(textEvents) },
  expect: {
    outcome: 'ok',
    stream: true,
    stopReason: 'end_turn',
    inputTokens: 12,
    outputTokens: 12,
    toolCalls: 0,
    reasoning: false,
    text: TEXT_PIECES.join(''),
  },
};

const WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  input_schema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
};

const THINKING_PIECES = ['The user wants', ' the weather in Paris.', ' I should call get_weather.'];
const TOOL_ARGS = ['', '{"loca', 'tion": "Pa', 'ris"}'];
const TOOL_USE_ID = 'toolu_01T1x1fJ34qAmk2tNTrN7Up6';

const toolUseEvents: TimedEvent[] = [
  messageStart(520, 'msg_01Aq9w938a90dw8q', 402),
  event(520, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
  ...THINKING_PIECES.map((thinking, i) => event(spread(3, 1210, 1290)[i], 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking } })),
  event(1320, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds' } }),
  blockStop(1320, 0),
  event(1340, 'content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
  ...textDeltas(1, ["I'll check", ' the weather.'], [1360, 1385]),
  blockStop(1400, 1),
  event(1410, 'content_block_start', { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: TOOL_USE_ID, name: 'get_weather', input: {} } }),
  ...TOOL_ARGS.map((partial_json, i) => event(spread(4, 1410, 1520)[i], 'content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json } })),
  blockStop(1530, 2),
  ...messageEnd(1531, 'tool_use', 85),
];

export const anthropicToolUseThinking: ExchangeFixture = {
  id: 'anthropic-tool-use-thinking',
  protocol: 'anthropic-messages',
  description: 'Extended thinking followed by text and a tool_use block.',
  request: {
    method: 'POST',
    path: '/v1/messages',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant-real-secret' },
    body: {
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      stream: true,
      thinking: { type: 'enabled', budget_tokens: 2048 },
      system: [{ type: 'text', text: 'You are a weather assistant.', cache_control: { type: 'ephemeral' } }],
      tools: [WEATHER_TOOL],
      messages: [{ role: 'user', content: [{ type: 'text', text: "What's the weather in Paris?" }] }],
    },
  },
  response: { status: 200, headersAt: 512, headers: HEADERS, chunks: chunksFromEvents(toolUseEvents) },
  expect: {
    outcome: 'ok',
    stream: true,
    stopReason: 'tool_use',
    inputTokens: 402,
    outputTokens: 85,
    toolCalls: 1,
    reasoning: true,
    text: "I'll check the weather.",
  },
};

const FOLLOWUP_PIECES = ["It's 18°C", ' and sunny', ' in Paris.'];

const followupEvents: TimedEvent[] = [
  messageStart(380, 'msg_01Bq7xKp2Nn4Ww9eE3rT5y', 498),
  event(380, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  ...textDeltas(0, FOLLOWUP_PIECES, [702, 744, 770]),
  blockStop(790, 0),
  ...messageEnd(790, 'end_turn', 14),
];

export const anthropicToolResultFollowup: ExchangeFixture = {
  id: 'anthropic-tool-result-followup',
  protocol: 'anthropic-messages',
  description: 'Second turn of the weather conversation, answering from a tool_result.',
  request: {
    method: 'POST',
    path: '/v1/messages',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant-real-secret' },
    body: {
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      stream: true,
      thinking: { type: 'enabled', budget_tokens: 2048 },
      system: [{ type: 'text', text: 'You are a weather assistant.', cache_control: { type: 'ephemeral' } }],
      tools: [WEATHER_TOOL],
      messages: [
        { role: 'user', content: [{ type: 'text', text: "What's the weather in Paris?" }] },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: THINKING_PIECES.join(''), signature: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds' },
            { type: 'text', text: "I'll check the weather." },
            { type: 'tool_use', id: TOOL_USE_ID, name: 'get_weather', input: { location: 'Paris' } },
          ],
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: TOOL_USE_ID, content: '18°C, sunny' }] },
      ],
    },
  },
  response: { status: 200, headersAt: 371, headers: HEADERS, chunks: chunksFromEvents(followupEvents) },
  expect: {
    outcome: 'ok',
    stream: true,
    stopReason: 'end_turn',
    inputTokens: 498,
    outputTokens: 14,
    toolCalls: 0,
    reasoning: false,
    text: FOLLOWUP_PIECES.join(''),
  },
};

const overloadedEvents: TimedEvent[] = [
  messageStart(450, 'msg_01Ov3rL0ad3dStr3amAbCd', 30),
  event(450, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  ...textDeltas(0, ['Once upon', ' a time'], [980, 1010]),
  event(1890, 'error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }),
];

export const anthropicOverloadedMidStream: ExchangeFixture = {
  id: 'anthropic-overloaded-mid-stream',
  protocol: 'anthropic-messages',
  description: 'Stream that fails with an overloaded_error event after partial output.',
  request: {
    method: 'POST',
    path: '/v1/messages',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant-real-secret' },
    body: { model: 'claude-sonnet-4-5', max_tokens: 1024, stream: true, messages: [{ role: 'user', content: 'Tell me a story' }] },
  },
  response: { status: 200, headersAt: 444, headers: HEADERS, chunks: chunksFromEvents(overloadedEvents) },
  expect: {
    outcome: 'stream_error:overloaded_error',
    stream: true,
    stopReason: null,
    inputTokens: 30,
    toolCalls: 0,
    reasoning: false,
    text: 'Once upon a time',
  },
};

const RATE_LIMIT_BODY = JSON.stringify({
  type: 'error',
  error: {
    type: 'rate_limit_error',
    message: 'This request would exceed the rate limit for your organization of 50 requests per minute. For details, refer to: https://docs.claude.com/en/api/rate-limits.',
  },
  request_id: 'req_011CTxRateLimitedAbcdEf',
});

export const anthropicRateLimited: ExchangeFixture = {
  id: 'anthropic-429',
  protocol: 'anthropic-messages',
  description: 'HTTP 429 rate_limit_error with retry-after.',
  request: {
    method: 'POST',
    path: '/v1/messages',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant-real-secret' },
    body: { model: 'claude-sonnet-4-5', max_tokens: 1024, stream: true, messages: [{ role: 'user', content: 'Say hello again' }] },
  },
  response: {
    status: 429,
    headersAt: 96,
    headers: {
      'content-type': 'application/json',
      'retry-after': '12',
      'x-should-retry': 'true',
      'request-id': 'req_011CTxRateLimitedAbcdEf',
      'anthropic-ratelimit-requests-limit': '50',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-reset': '2026-10-04T08:00:12Z',
    },
    chunks: [{ t: 97, text: RATE_LIMIT_BODY }],
  },
  expect: { outcome: 'http_error:429', stream: false, toolCalls: 0, reasoning: false },
};

const NON_STREAM_BODY = JSON.stringify({
  id: 'msg_01NonStr3amReplyXyZ',
  type: 'message',
  role: 'assistant',
  model: MODEL,
  content: [{ type: 'text', text: 'Paris is the capital of France.' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 9, service_tier: 'standard' },
});

export const anthropicNonStream: ExchangeFixture = {
  id: 'anthropic-non-stream',
  protocol: 'anthropic-messages',
  description: 'Non-streaming JSON reply.',
  request: {
    method: 'POST',
    path: '/v1/messages',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-ant-real-secret' },
    body: { model: 'claude-sonnet-4-5', max_tokens: 1024, messages: [{ role: 'user', content: 'What is the capital of France?' }] },
  },
  response: {
    status: 200,
    headersAt: 1180,
    headers: { 'content-type': 'application/json', 'request-id': 'req_011CTxNonStreamAbcdefgh' },
    chunks: [{ t: 1181, text: NON_STREAM_BODY }],
  },
  expect: {
    outcome: 'ok',
    stream: false,
    stopReason: 'end_turn',
    inputTokens: 15,
    outputTokens: 9,
    toolCalls: 0,
    reasoning: false,
    text: 'Paris is the capital of France.',
  },
};
