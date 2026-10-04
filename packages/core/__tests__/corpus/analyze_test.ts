import { describe, expect, it } from 'vitest';

import { decodeWireFrames } from '../../src/index.ts';
import { fixtureRecording } from '../support/fixtures.ts';
import { ALL_FIXTURES, anthropicText, chatText, geminiJsonArrayFunctionCall } from '@flowmock/test-fixtures';

describe('recording analysis', () => {
  it.each(ALL_FIXTURES.map(fixture => [fixture.id, fixture] as const))('derives the features of %s', (_id, fixture) => {
    const { features } = fixtureRecording(fixture);
    const { expect: expected } = fixture;
    expect(features.outcome).toBe(expected.outcome);
    expect(features.stream).toBe(expected.stream);
    expect(features.toolCalls).toBe(expected.toolCalls);
    expect(features.reasoning).toBe(expected.reasoning);
    if (expected.stopReason !== undefined) expect(features.stopReason).toBe(expected.stopReason);
    if (expected.inputTokens !== undefined) expect(features.inputTokens).toBe(expected.inputTokens);
    if (expected.outputTokens !== undefined) expect(features.outputTokens).toBe(expected.outputTokens);
  });

  it('measures TTFT at the first output frame and TPS over the rest', () => {
    const { features } = fixtureRecording(anthropicText);
    // "Hello" carries 5 of the 32 output characters; the remaining share of
    // 12 tokens arrives between 905ms and 1012ms.
    expect(features.ttftMs).toBe(905);
    const decoded = 12 - (12 * 5) / 32;
    expect(features.tps).toBeCloseTo((decoded * 1000) / (1012 - 905), 6);
  });

  it('keeps frame times at the arrival of the chunk that completed them', () => {
    const recording = fixtureRecording(chatText);
    const frames = decodeWireFrames(recording.response.wire, recording.response.chunks);
    expect(frames[0].t).toBe(388);
    expect(frames.at(-1)).toMatchObject({ done: true, t: 479 });
  });

  it('reads Gemini JSON array elements and the closing bracket', () => {
    const recording = fixtureRecording(geminiJsonArrayFunctionCall);
    expect(recording.response.wire).toBe('json-array');
    const frames = decodeWireFrames(recording.response.wire, recording.response.chunks);
    expect(frames.map(frame => frame.kind)).toEqual(['json-element', 'json-element', 'trailer']);
    expect(frames.map(frame => frame.raw).join('')).toBe(geminiJsonArrayFunctionCall.response.chunks.map(chunk => chunk.text).join(''));
  });

  it('marks a stream cut before its terminal event as truncated', () => {
    const recording = fixtureRecording({
      ...anthropicText,
      response: { ...anthropicText.response, chunks: anthropicText.response.chunks.slice(0, 3) },
    });
    expect(recording.features.outcome).toBe('truncated');
  });
});
