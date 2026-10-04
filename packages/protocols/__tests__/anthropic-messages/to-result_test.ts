import { describe, expect, it } from 'vitest';

import { collectAnthropicMessagesProtocolEventsToResult, parseAnthropicMessagesStream } from '../../src/anthropic-messages/index.ts';
import { streamFromFixtureChunks } from '../common/test-utils.ts';
import { anthropicOverloadedMidStream, anthropicText, anthropicToolUseThinking } from '@flowmock/test-fixtures';

describe('collectAnthropicMessagesProtocolEventsToResult', () => {
  it('reassembles text and usage', async () => {
    const result = await collectAnthropicMessagesProtocolEventsToResult(parseAnthropicMessagesStream(streamFromFixtureChunks(anthropicText.response.chunks)));
    expect(result).toMatchObject({
      id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: anthropicText.expect.text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 12 },
    });
  });

  it('reassembles thinking, text and a tool_use input', async () => {
    const result = await collectAnthropicMessagesProtocolEventsToResult(parseAnthropicMessagesStream(streamFromFixtureChunks(anthropicToolUseThinking.response.chunks)));
    expect(result.content).toEqual([
      { type: 'thinking', thinking: 'The user wants the weather in Paris. I should call get_weather.', signature: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds' },
      { type: 'text', text: "I'll check the weather." },
      { type: 'tool_use', id: 'toolu_01T1x1fJ34qAmk2tNTrN7Up6', name: 'get_weather', input: { location: 'Paris' } },
    ]);
    expect(result.stop_reason).toBe('tool_use');
  });

  it('surfaces an error event as a thrown error', async () => {
    await expect(collectAnthropicMessagesProtocolEventsToResult(parseAnthropicMessagesStream(streamFromFixtureChunks(anthropicOverloadedMidStream.response.chunks))))
      .rejects.toThrow('overloaded_error: Overloaded');
  });
});
