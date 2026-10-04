import { describe, expect, it } from 'vitest';

import { prepareRequest } from '../../src/index.ts';
import { prepareFixtureRequest } from '../support/fixtures.ts';
import { anthropicToolResultFollowup, anthropicToolUseThinking, chatText, geminiJsonArrayFunctionCall, responsesFunctionCall } from '@flowmock/test-fixtures';

describe('request normalization', () => {
  it('ignores sampling parameters, metadata, stream flags and cache hints', () => {
    const base = prepareFixtureRequest(anthropicToolUseThinking);
    const body = anthropicToolUseThinking.request.body;
    const variant = prepareFixtureRequest(anthropicToolUseThinking, {
      body: {
        ...body,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 99,
        stream: false,
        metadata: { user_id: 'someone-else' },
        system: [{ type: 'text', text: 'You are a weather assistant.' }],
      },
    });
    expect(variant.fingerprint.fingerprint).toBe(base.fingerprint.fingerprint);
  });

  it('replaces tool call ids with ordinals', () => {
    const body = anthropicToolResultFollowup.request.body as { messages: Array<{ role: string; content: unknown }> };
    const renamed = JSON.parse(JSON.stringify(body).replaceAll('toolu_01T1x1fJ34qAmk2tNTrN7Up6', 'toolu_somethingElseEntirely')) as Record<string, unknown>;
    expect(prepareFixtureRequest(anthropicToolResultFollowup, { body: renamed }).fingerprint.fingerprint)
      .toBe(prepareFixtureRequest(anthropicToolResultFollowup).fingerprint.fingerprint);
  });

  it('keeps conversation content significant', () => {
    const body = { ...chatText.request.body, messages: [{ role: 'user', content: 'Hello?' }] };
    expect(prepareFixtureRequest(chatText, { body }).fingerprint.fingerprint).not.toBe(prepareFixtureRequest(chatText).fingerprint.fingerprint);
  });

  it('treats a string message and a single text part alike, and developer like system', () => {
    const strings = prepareRequest({ protocol: 'openai-chat-completions', transport: 'http', body: { model: 'm', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Q' }] } });
    const parts = prepareRequest({ protocol: 'openai-chat-completions', transport: 'http', body: { model: 'm', messages: [{ role: 'developer', content: [{ type: 'text', text: 'S' }] }, { role: 'user', content: [{ type: 'text', text: 'Q' }] }] } });
    expect(parts.fingerprint.fingerprint).toBe(strings.fingerprint.fingerprint);
  });

  it('shares a prefix between consecutive turns of one conversation', () => {
    const first = prepareFixtureRequest(anthropicToolUseThinking);
    const second = prepareFixtureRequest(anthropicToolResultFollowup);
    expect(second.fingerprint.prefixHashes.slice(0, 2)).toEqual(first.fingerprint.prefixHashes);
    expect(second.sessionId).toBe(first.sessionId);
  });

  it('expands a previous_response_id continuation to the same conversation as a full resend', () => {
    const history = [
      ...((responsesFunctionCall.request.body as { input: unknown[] }).input),
      { type: 'reasoning', id: 'rs_1', summary: [] },
      { type: 'function_call', id: 'fc_1', call_id: 'call_A', name: 'get_weather', arguments: '{"location":"Paris"}', status: 'completed' },
    ];
    const followup = { type: 'function_call_output', call_id: 'call_A', output: '18C' };
    const continued = prepareFixtureRequest(responsesFunctionCall, { body: { ...responsesFunctionCall.request.body, previous_response_id: 'resp_1', input: [followup] }, history });
    const resent = prepareFixtureRequest(responsesFunctionCall, { body: { ...responsesFunctionCall.request.body, input: [...history, followup] } });
    expect(continued.fingerprint.fingerprint).toBe(resent.fingerprint.fingerprint);
    expect(continued.conversationItems).toHaveLength(4);
  });

  it('marks an unresolved previous_response_id in the header', () => {
    const unresolved = prepareFixtureRequest(responsesFunctionCall, { body: { ...responsesFunctionCall.request.body, previous_response_id: 'resp_unknown' } });
    expect(unresolved.normalized.segments[0]).toMatchObject({ previous_response: 'unresolved' });
  });

  it('reads Gemini model and streaming from the path and drops thought parts', () => {
    const prepared = prepareFixtureRequest(geminiJsonArrayFunctionCall);
    expect(prepared.normalized.model).toBe('gemini-2.5-flash');
    expect(prepared.stream).toBe(true);
    expect(prepared.wire).toBe('json-array');
    const withThought = prepareFixtureRequest(geminiJsonArrayFunctionCall, {
      body: { ...geminiJsonArrayFunctionCall.request.body, contents: [{ role: 'user', parts: [{ text: 'Weather in Paris?' }, { text: 'hidden', thought: true }] }] },
    });
    expect(withThought.fingerprint.fingerprint).toBe(prepared.fingerprint.fingerprint);
  });

  it('reports request features for sampling', () => {
    expect(prepareFixtureRequest(anthropicToolUseThinking).normalized.features).toEqual({
      hasTools: true,
      toolNames: ['get_weather'],
      reasoningRequested: true,
      inputChars: 28 + 28,
    });
  });
});
