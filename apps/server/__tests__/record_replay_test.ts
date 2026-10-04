import { isDeepStrictEqual } from 'node:util';

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startFakeUpstream, type FakeUpstream } from './support/fake-upstream.ts';
import { startTestServer, type TestServer } from './support/flowmock.ts';
import {
  ALL_FIXTURES,
  anthropicText,
  anthropicToolResultFollowup,
  anthropicToolUseThinking,
  chatText,
  chatToolCalls,
  type ExchangeFixture,
  fixtureBodyText,
  geminiJsonArrayFunctionCall,
  geminiSseText,
  responsesFunctionCall,
  responsesText,
} from '@flowmock/test-fixtures';

const RECORD_KEY = 'fm-record-0001';
const REPLAY_KEY = 'fm-replay-0001';

let flowmock: TestServer;
let upstream: FakeUpstream;

const fixtureFor = (request: { path: string; body: string }): ExchangeFixture => {
  const body = JSON.parse(request.body) as Record<string, unknown>;
  const fixture = ALL_FIXTURES.find(candidate => request.path.startsWith(candidate.request.path.split('?')[0]) && isDeepStrictEqual(candidate.request.body, body));
  if (!fixture) throw new Error(`no fixture for ${request.path} ${request.body}`);
  return fixture;
};

const record = async (fixture: ExchangeFixture, headers: Record<string, string> = {}): Promise<Response> => await fetch(`${flowmock.url}${fixture.request.path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': RECORD_KEY, ...headers },
  body: JSON.stringify(fixture.request.body),
});

beforeAll(async () => {
  upstream = await startFakeUpstream();
  upstream.respondWith(fixtureFor);
  flowmock = await startTestServer();
  flowmock.services.config.upsertTarget({ id: 'upstream', baseUrl: upstream.url, headers: { 'x-api-key': 'sk-upstream-secret', authorization: 'Bearer sk-upstream-secret', 'x-goog-api-key': 'sk-upstream-secret' } });
  flowmock.services.config.upsertKey({ key: RECORD_KEY, name: 'recorder', record: 'upstream' });
  flowmock.services.config.upsertKey({ key: REPLAY_KEY, name: 'replayer', replay: 'default' });
});

afterAll(async () => {
  await flowmock.stop();
  await upstream.close();
});

describe('recording proxy', () => {
  it('forwards the exchange byte for byte and stores it with its features', async () => {
    const response = await record(anthropicText, { 'x-flowmock-session': 'run-1' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(await response.text()).toBe(fixtureBodyText(anthropicText));

    const sent = upstream.requests.at(-1)!;
    expect(sent.headers['x-api-key']).toBe('sk-upstream-secret');
    expect(sent.headers['x-flowmock-session']).toBeUndefined();
    expect(JSON.parse(sent.body)).toEqual(anthropicText.request.body);

    const list = await (await flowmock.admin('/recordings?protocol=anthropic-messages')).json() as { items: Array<{ id: string; features: { outcome: string; outputTokens: number; ttftMs: number }; sessionId: string; cassetteId: string }> };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ sessionId: 'run-1', features: { outcome: 'ok', outputTokens: 12 } });
    // The fake upstream plays the fixture at 1/20 speed.
    expect(list.items[0].features.ttftMs).toBeGreaterThan(905 * 0.05 * 0.8);

    const detail = await (await flowmock.admin(`/recordings/${list.items[0].id}`)).json() as { request: { headers: Array<[string, string]> }; frames: unknown[] };
    expect(detail.request.headers).toContainEqual(['x-api-key', '[redacted]']);
    expect(detail.frames).toHaveLength(11);
  });

  it.each([chatText, chatToolCalls, responsesText, responsesFunctionCall, geminiSseText, geminiJsonArrayFunctionCall, anthropicToolUseThinking, anthropicToolResultFollowup])('records $id', async fixture => {
    const response = await record(fixture);
    expect(await response.text()).toBe(fixtureBodyText(fixture));
  });

  it('groups a session into one cassette in request order', async () => {
    const cassettes = await (await flowmock.admin('/cassettes')).json() as { items: Array<{ id: string; sessionId: string; recordings: number }> };
    const weather = cassettes.items.find(cassette => cassette.recordings === 2 && cassette.sessionId.startsWith('auto-'));
    expect(weather).toBeDefined();
    const detail = await (await flowmock.admin(`/cassettes/${weather!.id}`)).json() as { recordings: Array<{ cassetteSeq: number; features: { stopReason: string } }> };
    expect(detail.recordings.map(recording => [recording.cassetteSeq, recording.features.stopReason])).toEqual([[1, 'tool_use'], [2, 'end_turn']]);
  });
});

describe('replay through official SDKs', () => {
  it('replays Anthropic Messages to the Anthropic SDK with fresh ids', async () => {
    const client = new Anthropic({ apiKey: REPLAY_KEY, baseURL: flowmock.url, maxRetries: 0 });
    const stream = client.messages.stream({ model: 'claude-sonnet-4-5', max_tokens: 1024, messages: [{ role: 'user', content: 'Say hello' }] });
    const message = await stream.finalMessage();
    expect(message.content).toEqual([{ type: 'text', text: 'Hello! How can I help you today?', citations: null }].map(block => expect.objectContaining({ type: block.type, text: block.text })));
    expect(message.id).toMatch(/^msg_/);
    expect(message.id).not.toBe('msg_01XFDUDYJgAACzvnptvVoYEL');
    expect(message.usage.output_tokens).toBe(12);
  });

  it('replays a tool call and its follow-up turn by conversation', async () => {
    const client = new Anthropic({ apiKey: REPLAY_KEY, baseURL: flowmock.url, maxRetries: 0 });
    const body = anthropicToolUseThinking.request.body as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const first = await client.messages.create({ ...body, stream: false });
    const toolUse = first.content.find(block => block.type === 'tool_use')!;
    expect(toolUse).toMatchObject({ name: 'get_weather', input: { location: 'Paris' } });
    // The client echoes the rewritten tool id; ordinals keep the match.
    const followup = await client.messages.create({
      ...body,
      stream: false,
      messages: [
        ...body.messages,
        { role: 'assistant', content: first.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: '18°C, sunny' }] },
      ],
    });
    expect(followup.content[0]).toMatchObject({ type: 'text', text: "It's 18°C and sunny in Paris." });
  });

  it('replays Chat Completions to the OpenAI SDK', async () => {
    const client = new OpenAI({ apiKey: REPLAY_KEY, baseURL: `${flowmock.url}/v1`, maxRetries: 0 });
    const stream = await client.chat.completions.create({ model: 'gpt-4o-mini', stream: true, stream_options: { include_usage: true }, messages: [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'Hello!' }] });
    let text = '';
    let usage: OpenAI.CompletionUsage | null | undefined;
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta.content ?? '';
      usage ??= chunk.usage;
    }
    expect(text).toBe('Hello! How can I help?');
    expect(usage?.completion_tokens).toBe(8);

    const tools = await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Weather and time in Paris?' }], tools: (chatToolCalls.request.body as { tools: OpenAI.ChatCompletionTool[] }).tools });
    expect(tools.choices[0].message.tool_calls?.map(call => call.type === 'function' ? call.function.name : null)).toEqual(['get_weather', 'get_time']);
  });

  it('replays Responses to the OpenAI SDK', async () => {
    const client = new OpenAI({ apiKey: REPLAY_KEY, baseURL: `${flowmock.url}/v1`, maxRetries: 0 });
    const stream = client.responses.stream({ model: 'gpt-5-mini', instructions: 'Be brief.', input: [{ role: 'user', content: 'Hi!' }], reasoning: { effort: 'low' } });
    const response = await stream.finalResponse();
    expect(response.output_text).toBe('Hi there! What can I do for you?');
    expect(response.id).not.toBe('resp_68e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2');
  });

  it('replays Gemini to the Google GenAI SDK, over SSE and as a JSON array', async () => {
    const ai = new GoogleGenAI({ apiKey: REPLAY_KEY, httpOptions: { baseUrl: flowmock.url } });
    let text = '';
    for await (const chunk of await ai.models.generateContentStream({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ text: 'Why is the sky blue?' }] }] })) text += chunk.text ?? '';
    expect(text).toBe('The sky looks blue because air scatters short wavelengths more.');

    const array = await fetch(`${flowmock.url}/v1beta/models/gemini-2.5-flash:streamGenerateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': REPLAY_KEY },
      body: JSON.stringify(geminiJsonArrayFunctionCall.request.body),
    });
    const elements = JSON.parse(await array.text()) as Array<{ candidates: Array<{ content: { parts: unknown[] } }> }>;
    expect(elements.at(-1)?.candidates[0].content.parts[0]).toMatchObject({ functionCall: { name: 'get_weather', args: { location: 'Paris' } } });
  });

  it('serves the models the corpus holds', async () => {
    const client = new OpenAI({ apiKey: REPLAY_KEY, baseURL: `${flowmock.url}/v1`, maxRetries: 0 });
    const models = [];
    for await (const model of client.models.list()) models.push(model.id);
    expect(models).toEqual(expect.arrayContaining(['gpt-4o-mini', 'gpt-5-mini', 'claude-sonnet-4-5']));
    const anthropic = new Anthropic({ apiKey: REPLAY_KEY, baseURL: flowmock.url, maxRetries: 0 });
    const anthropicModels = [];
    for await (const model of anthropic.models.list()) anthropicModels.push(model.id);
    expect(anthropicModels).toEqual(['claude-sonnet-4-5']);
  });

  it('rejects unknown keys in the protocol\'s own error shape', async () => {
    const client = new Anthropic({ apiKey: 'fm-unknown-key', baseURL: flowmock.url, maxRetries: 0 });
    await expect(client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ status: 401 });
  });

  it('replays a recorded cassette in order with sequence selection', async () => {
    const cassettes = await (await flowmock.admin('/cassettes')).json() as { items: Array<{ id: string; recordings: number; sessionId: string }> };
    const weather = cassettes.items.find(cassette => cassette.recordings === 2 && cassette.sessionId.startsWith('auto-'))!;
    flowmock.services.config.upsertScenario(`name: weather-run\nselection: { mode: sequence, cassette: ${weather.id}, onEnd: error }\n`);
    flowmock.services.config.upsertKey({ key: 'fm-sequence-0001', replay: 'weather-run' });
    const client = new Anthropic({ apiKey: 'fm-sequence-0001', baseURL: flowmock.url, maxRetries: 0, defaultHeaders: { 'x-flowmock-session': 'sequence-run' } });
    // Sequence replay ignores what the client asks; the run replays in order.
    const ask = async () => await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 64, messages: [{ role: 'user', content: 'anything' }] });
    expect((await ask()).stop_reason).toBe('tool_use');
    expect((await ask()).stop_reason).toBe('end_turn');
    await expect(ask()).rejects.toMatchObject({ status: 404 });
  });

  it('replays recorded bytes exactly under raw fidelity', async () => {
    flowmock.services.config.upsertScenario('name: raw-bytes\nfidelity: raw\nselection: { mode: match }\ntiming: { mode: recorded, scale: 0.1 }\n');
    flowmock.services.config.upsertKey({ key: 'fm-raw-0001', replay: 'raw-bytes' });
    const response = await fetch(`${flowmock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer fm-raw-0001' },
      body: JSON.stringify(chatText.request.body),
    });
    expect(await response.text()).toBe(fixtureBodyText(chatText));
  });

  it('lists every replay in the request timeline with its provenance', async () => {
    const timeline = await (await flowmock.admin('/requests?mode=replay')).json() as { items: Array<{ protocol: string; recordingId: string; trace: { error: unknown; selection: { mode: string }; provenance: Array<{ transform: string }> } }> };
    expect(timeline.items.length).toBeGreaterThanOrEqual(6);
    const anthropicReplay = timeline.items.find(item => item.protocol === 'anthropic-messages' && item.trace.error === null && item.trace.selection.mode === 'exact')!;
    expect(anthropicReplay.trace.provenance.map(entry => entry.transform)).toContain('rewrite');
  });
});
