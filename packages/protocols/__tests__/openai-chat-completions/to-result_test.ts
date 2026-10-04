import { describe, expect, it } from 'vitest';

import { collectOpenAIChatCompletionsProtocolEventsToResult, openaiChatCompletionsErrorPayloadMessage, parseOpenAIChatCompletionsStream } from '../../src/openai-chat-completions/index.ts';
import { collectAsync, streamFromFixtureChunks } from '../common/test-utils.ts';
import { chatErrorChunk, chatText, chatToolCalls } from '@flowmock/test-fixtures';

describe('OpenAI Chat Completions stream', () => {
  it('reassembles text, finish reason and the trailing usage chunk', async () => {
    const result = await collectOpenAIChatCompletionsProtocolEventsToResult(parseOpenAIChatCompletionsStream(streamFromFixtureChunks(chatText.response.chunks)));
    expect(result).toMatchObject({
      id: 'chatcmpl-AbCdEf0123456789GhIjKlMnOpQr',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: chatText.expect.text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 9, completion_tokens: 8 },
      system_fingerprint: 'fp_560af6e559',
    });
  });

  it('merges parallel tool call fragments by index', async () => {
    const result = await collectOpenAIChatCompletionsProtocolEventsToResult(parseOpenAIChatCompletionsStream(streamFromFixtureChunks(chatToolCalls.response.chunks)));
    expect(result.choices[0].message.tool_calls).toEqual([
      { id: 'call_DdmO9pD3xa9XTPNJ32zg2hcA', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
      { id: 'call_7xKp2Nn4Ww9eE3rT5yU8iO0p', type: 'function', function: { name: 'get_time', arguments: '{"tz":"Europe/Paris"}' } },
    ]);
    expect(result.choices[0].finish_reason).toBe('tool_calls');
  });

  it('yields an in-band error chunk as an event instead of throwing', async () => {
    const frames = await collectAsync(parseOpenAIChatCompletionsStream(streamFromFixtureChunks(chatErrorChunk.response.chunks)));
    const last = frames.at(-1);
    expect(last?.type).toBe('event');
    expect(last?.type === 'event' && openaiChatCompletionsErrorPayloadMessage(last.event)).toBe('server_error: The server had an error while processing your request. Sorry about that!');
  });
});
