import { describe, expect, it } from 'vitest';

import { collectOpenAIResponsesProtocolEventsToResult, OPENAI_RESPONSES_MISSING_TERMINAL_MESSAGE, parseOpenAIResponsesStream } from '../../src/openai-responses/index.ts';
import { streamFromChunks, streamFromFixtureChunks } from '../common/test-utils.ts';
import { responsesFailed, responsesFunctionCall, responsesText } from '@flowmock/test-fixtures';

describe('OpenAI Responses stream', () => {
  it('collects the terminal response object', async () => {
    const result = await collectOpenAIResponsesProtocolEventsToResult(parseOpenAIResponsesStream(streamFromFixtureChunks(responsesText.response.chunks)));
    expect(result).toMatchObject({ id: 'resp_68e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2', status: 'completed', usage: { output_tokens: 9 } });
  });

  it('keeps reasoning and function call items', async () => {
    const result = await collectOpenAIResponsesProtocolEventsToResult(parseOpenAIResponsesStream(streamFromFixtureChunks(responsesFunctionCall.response.chunks)));
    expect(result.output.map(item => item.type)).toEqual(['reasoning', 'function_call']);
  });

  it('returns a failed response as its terminal object', async () => {
    const result = await collectOpenAIResponsesProtocolEventsToResult(parseOpenAIResponsesStream(streamFromFixtureChunks(responsesFailed.response.chunks)));
    expect(result).toMatchObject({ status: 'failed', error: { code: 'server_error' } });
  });

  it('re-attaches a type carried only by the SSE event name', async () => {
    const body = 'event: response.completed\ndata: {"response":{"id":"resp_1","object":"response","model":"m","output":[],"status":"completed","error":null,"incomplete_details":null}}\n\n';
    const result = await collectOpenAIResponsesProtocolEventsToResult(parseOpenAIResponsesStream(streamFromChunks([body])));
    expect(result.id).toBe('resp_1');
  });

  it('rejects a stream without a terminal event', async () => {
    const body = 'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1"}}\n\n';
    await expect(collectOpenAIResponsesProtocolEventsToResult(parseOpenAIResponsesStream(streamFromChunks([body])))).rejects.toThrow(OPENAI_RESPONSES_MISSING_TERMINAL_MESSAGE);
  });
});
