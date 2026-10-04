import { describe, expect, it } from 'vitest';

import {
  collectGeminiGenerateContentProtocolEventsToResult,
  GEMINI_JSON_ARRAY_CLOSE,
  geminiGenerateContentEventToJsonArrayElement,
  geminiJsonArrayElementPrefix,
  parseGeminiGenerateContentJsonArrayStream,
  parseGeminiGenerateContentSseStream,
} from '../../src/gemini-generate-content/index.ts';
import { collectAsync, splitBytesAt, streamFromChunks, streamFromFixtureChunks } from '../common/test-utils.ts';
import { geminiJsonArrayFunctionCall, geminiSseText } from '@flowmock/test-fixtures';

describe('Gemini generateContent streams', () => {
  it('parses alt=sse and merges adjacent text parts', async () => {
    const result = await collectGeminiGenerateContentProtocolEventsToResult(parseGeminiGenerateContentSseStream(streamFromFixtureChunks(geminiSseText.response.chunks)));
    expect(result.candidates?.[0]).toMatchObject({ content: { parts: [{ text: geminiSseText.expect.text }], role: 'model' }, finishReason: 'STOP' });
    expect(result.usageMetadata).toMatchObject({ candidatesTokenCount: 16, thoughtsTokenCount: 28 });
  });

  it('parses the JSON array stream and keeps thought and function call parts apart', async () => {
    const frames = await collectAsync(parseGeminiGenerateContentJsonArrayStream(streamFromFixtureChunks(geminiJsonArrayFunctionCall.response.chunks)));
    expect(frames.map(frame => frame.type)).toEqual(['event', 'event', 'done']);
    const result = await collectGeminiGenerateContentProtocolEventsToResult(parseGeminiGenerateContentJsonArrayStream(streamFromFixtureChunks(geminiJsonArrayFunctionCall.response.chunks)));
    expect(result.candidates?.[0].content.parts).toEqual([
      { text: 'The user wants weather data.', thought: true },
      { functionCall: { name: 'get_weather', args: { location: 'Paris' } }, thoughtSignature: 'CiQB0e2Kb0NmbWNhbGwtc2lnbmF0dXJl' },
    ]);
  });

  it('decodes a JSON array split inside a multi-byte character', async () => {
    const body = `[${JSON.stringify({ candidates: [{ content: { parts: [{ text: '温度 18°C' }], role: 'model' }, finishReason: 'STOP', index: 0 }] })}]`;
    const offset = new TextEncoder().encode(body).indexOf(0xe6) + 1;
    const frames = await collectAsync(parseGeminiGenerateContentJsonArrayStream(streamFromChunks(splitBytesAt(body, offset))));
    expect(frames[0]).toMatchObject({ type: 'event', event: { candidates: [{ content: { parts: [{ text: '温度 18°C' }] } }] } });
  });

  it('rejects a JSON array stream that never closes', async () => {
    await expect(collectAsync(parseGeminiGenerateContentJsonArrayStream(streamFromChunks(['[{"candidates": []}'])))).rejects.toThrow(/closing bracket/);
  });

  it('encodes elements in the separator spelling the decoder reads back', async () => {
    const events = [{ responseId: 'a' }, { responseId: 'b' }];
    const body = events.map((event, index) => geminiJsonArrayElementPrefix(index) + geminiGenerateContentEventToJsonArrayElement(event)).join('') + GEMINI_JSON_ARRAY_CLOSE;
    const frames = await collectAsync(parseGeminiGenerateContentJsonArrayStream(streamFromChunks([body])));
    expect(frames).toEqual([{ type: 'event', event: { responseId: 'a' } }, { type: 'event', event: { responseId: 'b' } }, { type: 'done' }]);
  });
});
