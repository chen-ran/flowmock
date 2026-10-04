import { chunksFromEvents, type ExchangeFixture, spread, sseBlock, type TimedEvent } from './builders.ts';

// Event shapes follow the Responses streaming reference. The HTTP stream ends
// after the terminal event with no `[DONE]` sentinel.
// https://platform.openai.com/docs/api-reference/responses-streaming

const MODEL = 'gpt-5-mini-2025-08-07';
const CREATED_AT = 1759550400;

const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'openai-processing-ms': '188',
  'x-request-id': 'req_2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f',
};

const responseObject = (id: string, status: string, output: unknown[], usage: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  object: 'response',
  created_at: CREATED_AT,
  status,
  background: false,
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  model: MODEL,
  output,
  parallel_tool_calls: true,
  previous_response_id: null,
  reasoning: { effort: 'low', summary: 'auto' },
  store: true,
  temperature: 1,
  text: { format: { type: 'text' }, verbosity: 'medium' },
  tool_choice: 'auto',
  tools: [],
  top_p: 1,
  truncation: 'disabled',
  usage,
  user: null,
  metadata: {},
  ...extra,
});

const sequenced = (events: Array<{ t: number; data: Record<string, unknown> }>): TimedEvent[] =>
  events.map(({ t, data }, sequence_number) => ({
    t,
    text: sseBlock(JSON.stringify({ type: data.type, sequence_number, ...data }), { event: data.type as string }),
  }));

const TEXT_RESPONSE_ID = 'resp_68e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2';
const TEXT_ITEM_ID = 'msg_68e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d3';
const TEXT_PIECES = ['Hi', ' there', '! What', ' can I', ' do for', ' you?'];
const FULL_TEXT = TEXT_PIECES.join('');
const textItem = (status: string, text: string) => ({
  id: TEXT_ITEM_ID,
  type: 'message',
  status,
  content: status === 'in_progress' ? [] : [{ type: 'output_text', annotations: [], logprobs: [], text }],
  role: 'assistant',
});
const TEXT_USAGE = { input_tokens: 21, input_tokens_details: { cached_tokens: 0 }, output_tokens: 9, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 30 };

const textEvents = sequenced([
  { t: 240, data: { type: 'response.created', response: responseObject(TEXT_RESPONSE_ID, 'in_progress', [], null) } },
  { t: 240, data: { type: 'response.in_progress', response: responseObject(TEXT_RESPONSE_ID, 'in_progress', [], null) } },
  { t: 610, data: { type: 'response.output_item.added', output_index: 0, item: textItem('in_progress', '') } },
  { t: 610, data: { type: 'response.content_part.added', item_id: TEXT_ITEM_ID, output_index: 0, content_index: 0, part: { type: 'output_text', annotations: [], logprobs: [], text: '' } } },
  ...TEXT_PIECES.map((delta, i) => ({ t: spread(TEXT_PIECES.length, 615, 720)[i], data: { type: 'response.output_text.delta', item_id: TEXT_ITEM_ID, output_index: 0, content_index: 0, delta, logprobs: [] } })),
  { t: 731, data: { type: 'response.output_text.done', item_id: TEXT_ITEM_ID, output_index: 0, content_index: 0, text: FULL_TEXT, logprobs: [] } },
  { t: 731, data: { type: 'response.content_part.done', item_id: TEXT_ITEM_ID, output_index: 0, content_index: 0, part: { type: 'output_text', annotations: [], logprobs: [], text: FULL_TEXT } } },
  { t: 731, data: { type: 'response.output_item.done', output_index: 0, item: textItem('completed', FULL_TEXT) } },
  { t: 745, data: { type: 'response.completed', response: responseObject(TEXT_RESPONSE_ID, 'completed', [textItem('completed', FULL_TEXT)], TEXT_USAGE, { completed_at: CREATED_AT + 1 }) } },
]);

export const responsesText: ExchangeFixture = {
  id: 'responses-text',
  protocol: 'openai-responses',
  description: 'Plain streamed text over HTTP SSE.',
  request: {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: { model: 'gpt-5-mini', stream: true, instructions: 'Be brief.', input: [{ role: 'user', content: 'Hi!' }], reasoning: { effort: 'low' } },
  },
  response: { status: 200, headersAt: 231, headers: HEADERS, chunks: chunksFromEvents(textEvents) },
  expect: { outcome: 'ok', stream: true, stopReason: 'completed', inputTokens: 21, outputTokens: 9, toolCalls: 0, reasoning: false, text: FULL_TEXT },
};

const FC_RESPONSE_ID = 'resp_68e0f00dfacecafe0123456789abcdef0123456789abcdef';
const REASONING_ID = 'rs_68e0f00dfacecafe0123456789abcdef0123456789abcde0';
const FC_ITEM_ID = 'fc_68e0f00dfacecafe0123456789abcdef0123456789abcde1';
const CALL_ID = 'call_Q3x9mVb2LkPq8RtZ1wYc4Hn6';
const ARG_PIECES = ['{"', 'location', '":"', 'Paris', '"}'];
const ARGS = ARG_PIECES.join('');
const SUMMARY_PIECES = ['**Checking weather**', '\n\nI need the', ' forecast for Paris.'];
const SUMMARY = SUMMARY_PIECES.join('');
const reasoningItem = (done: boolean) => ({ id: REASONING_ID, type: 'reasoning', summary: done ? [{ type: 'summary_text', text: SUMMARY }] : [] });
const fcItem = (done: boolean) => ({ id: FC_ITEM_ID, type: 'function_call', status: done ? 'completed' : 'in_progress', arguments: done ? ARGS : '', call_id: CALL_ID, name: 'get_weather' });
const FC_USAGE = { input_tokens: 88, input_tokens_details: { cached_tokens: 0 }, output_tokens: 150, output_tokens_details: { reasoning_tokens: 128 }, total_tokens: 238 };
const FC_TOOLS = [{ type: 'function', name: 'get_weather', description: 'Weather for a city.', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'], additionalProperties: false }, strict: true }];

const functionCallEvents = sequenced([
  { t: 300, data: { type: 'response.created', response: responseObject(FC_RESPONSE_ID, 'in_progress', [], null, { tools: FC_TOOLS }) } },
  { t: 300, data: { type: 'response.in_progress', response: responseObject(FC_RESPONSE_ID, 'in_progress', [], null, { tools: FC_TOOLS }) } },
  { t: 1820, data: { type: 'response.output_item.added', output_index: 0, item: reasoningItem(false) } },
  { t: 1820, data: { type: 'response.reasoning_summary_part.added', item_id: REASONING_ID, output_index: 0, summary_index: 0, part: { type: 'summary_text', text: '' } } },
  ...SUMMARY_PIECES.map((delta, i) => ({ t: spread(SUMMARY_PIECES.length, 1830, 1900)[i], data: { type: 'response.reasoning_summary_text.delta', item_id: REASONING_ID, output_index: 0, summary_index: 0, delta } })),
  { t: 1905, data: { type: 'response.reasoning_summary_text.done', item_id: REASONING_ID, output_index: 0, summary_index: 0, text: SUMMARY } },
  { t: 1905, data: { type: 'response.reasoning_summary_part.done', item_id: REASONING_ID, output_index: 0, summary_index: 0, part: { type: 'summary_text', text: SUMMARY } } },
  { t: 1905, data: { type: 'response.output_item.done', output_index: 0, item: reasoningItem(true) } },
  { t: 1950, data: { type: 'response.output_item.added', output_index: 1, item: fcItem(false) } },
  ...ARG_PIECES.map((delta, i) => ({ t: spread(ARG_PIECES.length, 1960, 2010)[i], data: { type: 'response.function_call_arguments.delta', item_id: FC_ITEM_ID, output_index: 1, delta } })),
  { t: 2015, data: { type: 'response.function_call_arguments.done', item_id: FC_ITEM_ID, output_index: 1, arguments: ARGS } },
  { t: 2015, data: { type: 'response.output_item.done', output_index: 1, item: fcItem(true) } },
  { t: 2030, data: { type: 'response.completed', response: responseObject(FC_RESPONSE_ID, 'completed', [reasoningItem(true), fcItem(true)], FC_USAGE, { tools: FC_TOOLS, completed_at: CREATED_AT + 2 }) } },
]);

export const responsesFunctionCall: ExchangeFixture = {
  id: 'responses-function-call',
  protocol: 'openai-responses',
  description: 'Reasoning summary followed by a function call.',
  request: {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: {
      model: 'gpt-5-mini',
      stream: true,
      store: false,
      reasoning: { effort: 'medium', summary: 'auto' },
      tools: FC_TOOLS,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Weather in Paris?' }] }],
    },
  },
  response: { status: 200, headersAt: 290, headers: HEADERS, chunks: chunksFromEvents(functionCallEvents) },
  expect: { outcome: 'ok', stream: true, stopReason: 'completed', inputTokens: 88, outputTokens: 150, toolCalls: 1, reasoning: true },
};

const FAILED_RESPONSE_ID = 'resp_68e0deadbeef0123456789abcdef0123456789abcdef0123';

const failedEvents = sequenced([
  { t: 260, data: { type: 'response.created', response: responseObject(FAILED_RESPONSE_ID, 'in_progress', [], null) } },
  { t: 260, data: { type: 'response.in_progress', response: responseObject(FAILED_RESPONSE_ID, 'in_progress', [], null) } },
  { t: 9800, data: { type: 'response.failed', response: responseObject(FAILED_RESPONSE_ID, 'failed', [], null, { error: { code: 'server_error', message: 'An error occurred while processing your request.' } }) } },
]);

export const responsesFailed: ExchangeFixture = {
  id: 'responses-failed',
  protocol: 'openai-responses',
  description: 'Stream that ends with response.failed.',
  request: {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: { model: 'gpt-5-mini', stream: true, input: 'Summarize War and Peace' },
  },
  response: { status: 200, headersAt: 250, headers: HEADERS, chunks: chunksFromEvents(failedEvents) },
  expect: { outcome: 'stream_error:server_error', stream: true, stopReason: 'failed', toolCalls: 0, reasoning: false },
};

const NON_STREAM_ID = 'resp_68e0aaaa0123456789abcdef0123456789abcdef01234567';
const NON_STREAM_ITEM = { id: 'msg_68e0aaaa0123456789abcdef0123456789abcdef01234568', type: 'message', status: 'completed', content: [{ type: 'output_text', annotations: [], logprobs: [], text: 'Paris.' }], role: 'assistant' };

export const responsesNonStream: ExchangeFixture = {
  id: 'responses-non-stream',
  protocol: 'openai-responses',
  description: 'Non-streaming JSON reply.',
  request: {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-proj-real-secret' },
    body: { model: 'gpt-5-mini', input: 'Capital of France?' },
  },
  response: {
    status: 200,
    headersAt: 905,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_nonstreamresponses0123456789' },
    chunks: [{
      t: 906,
      text: `${JSON.stringify(responseObject(NON_STREAM_ID, 'completed', [NON_STREAM_ITEM], { input_tokens: 12, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 14 }, { completed_at: CREATED_AT + 1 }), null, 2)}\n`,
    }],
  },
  expect: { outcome: 'ok', stream: false, stopReason: 'completed', inputTokens: 12, outputTokens: 2, toolCalls: 0, reasoning: false, text: 'Paris.' },
};
