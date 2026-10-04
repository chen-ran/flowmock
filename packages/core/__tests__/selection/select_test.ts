import { describe, expect, it } from 'vitest';

import { createRng, type PreparedRequest, selectionSchema, selectRecording, summarizeRecording } from '../../src/index.ts';
import { MemoryCorpus } from '../support/fakes.ts';
import { fixtureRecording, prepareFixtureRequest } from '../support/fixtures.ts';
import { anthropicNonStream, anthropicOverloadedMidStream, anthropicText, anthropicToolResultFollowup, anthropicToolUseThinking, chatText, chatToolCalls } from '@flowmock/test-fixtures';

const selectionRequest = (prepared: PreparedRequest, callIndex = 1) => ({
  protocol: prepared.protocol,
  model: prepared.normalized.model,
  stream: prepared.stream,
  features: prepared.normalized.features,
  fingerprint: prepared.fingerprint.fingerprint,
  prefixHashes: prepared.fingerprint.prefixHashes,
  callIndex,
});

const corpus = new MemoryCorpus().add(
  fixtureRecording(anthropicText),
  fixtureRecording(anthropicToolUseThinking),
  fixtureRecording(anthropicOverloadedMidStream),
  fixtureRecording(anthropicNonStream),
);
const candidates = [...corpus.recordings.values()].map(summarizeRecording);

describe('selectRecording', () => {
  it('matches the identical conversation exactly', async () => {
    const result = await selectRecording(selectionSchema.parse({ mode: 'match' }), selectionRequest(prepareFixtureRequest(anthropicToolUseThinking)), candidates, corpus, createRng('s'));
    expect(result).toMatchObject({ kind: 'selected', recording: { id: 'rec_anthropic-tool-use-thinking' }, reason: { mode: 'exact' } });
  });

  it('falls back to the longest shared conversation prefix', async () => {
    const result = await selectRecording(selectionSchema.parse({ mode: 'match' }), selectionRequest(prepareFixtureRequest(anthropicToolResultFollowup)), candidates, corpus, createRng('s'));
    expect(result).toMatchObject({ kind: 'selected', recording: { id: 'rec_anthropic-tool-use-thinking' }, reason: { mode: 'prefix', prefixLength: 2, requestLength: 4 } });
  });

  it('reports a miss when the prefix is shorter than minPrefix', async () => {
    const result = await selectRecording(selectionSchema.parse({ mode: 'match', minPrefix: 3 }), selectionRequest(prepareFixtureRequest(anthropicToolResultFollowup)), candidates, corpus, createRng('s'));
    expect(result.kind).toBe('miss');
  });

  it('does not return error outcomes or non-streamed recordings to a streaming match', async () => {
    const result = await selectRecording(selectionSchema.parse({ mode: 'match' }), selectionRequest(prepareFixtureRequest(anthropicOverloadedMidStream)), candidates, corpus, createRng('s'));
    expect(result.kind).toBe('miss');
    const widened = await selectRecording(selectionSchema.parse({ mode: 'match', outcomes: ['*'] }), selectionRequest(prepareFixtureRequest(anthropicOverloadedMidStream)), candidates, corpus, createRng('s'));
    expect(widened).toMatchObject({ kind: 'selected', recording: { id: 'rec_anthropic-overloaded-mid-stream' } });
  });

  it('samples after a miss in match-then-sample mode, preferring compatible tools and reasoning', async () => {
    const request = prepareFixtureRequest(anthropicToolUseThinking, {
      body: { ...anthropicToolUseThinking.request.body, messages: [{ role: 'user', content: 'Weather in Rome?' }] },
    });
    const result = await selectRecording(selectionSchema.parse({}), selectionRequest(request), candidates, corpus, createRng('s'));
    expect(result).toMatchObject({ kind: 'selected', recording: { id: 'rec_anthropic-tool-use-thinking' }, reason: { mode: 'sample' } });
  });

  it('never samples a recording whose tool calls the request cannot dispatch when strict', async () => {
    const request = prepareFixtureRequest(anthropicText, { body: { ...anthropicText.request.body, messages: [{ role: 'user', content: 'Other' }] } });
    const sampled = await selectRecording(selectionSchema.parse({ mode: 'sample', sample: { strict: true } }), selectionRequest(request), candidates, corpus, createRng('s'));
    expect(sampled).toMatchObject({ kind: 'selected', recording: { id: 'rec_anthropic-text' } });
  });

  it('serves a non-streaming request from a streamed recording', async () => {
    const request = prepareFixtureRequest(anthropicText, { body: { ...anthropicText.request.body, stream: false } });
    const result = await selectRecording(selectionSchema.parse({ mode: 'match' }), selectionRequest(request), candidates, corpus, createRng('s'));
    expect(result).toMatchObject({ kind: 'selected', recording: { id: 'rec_anthropic-text' }, reason: { mode: 'exact' } });
  });

  it('samples reproducibly for a seed', async () => {
    const many = new MemoryCorpus();
    for (let index = 0; index < 20; index++) many.add(fixtureRecording(chatText, { id: `rec_chat_${String(index).padStart(2, '0')}` }));
    const pool = [...many.recordings.values()].map(summarizeRecording);
    const request = selectionRequest(prepareFixtureRequest(chatText));
    const pick = async (seed: string) => {
      const result = await selectRecording(selectionSchema.parse({ mode: 'sample' }), request, pool, many, createRng(seed));
      return result.kind === 'selected' ? result.recording.id : null;
    };
    expect(await pick('42')).toBe(await pick('42'));
    const picks = new Set(await Promise.all(['1', '2', '3', '4', '5', '6', '7', '8'].map(pick)));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('walks a cassette by call index and honors onEnd', async () => {
    const cassette = new MemoryCorpus().add(
      fixtureRecording(chatText, { id: 'rec_a', cassetteId: 'cas_1', seq: 1 }),
      fixtureRecording(chatToolCalls, { id: 'rec_b', cassetteId: 'cas_1', seq: 2 }),
    ).addCassette({ id: 'cas_1', name: 'run', createdAt: 0, recordingIds: ['rec_a', 'rec_b'] });
    const pool = [...cassette.recordings.values()].map(summarizeRecording);
    const request = (callIndex: number) => selectionRequest(prepareFixtureRequest(chatText), callIndex);
    const select = async (callIndex: number, onEnd: string) => await selectRecording(selectionSchema.parse({ mode: 'sequence', cassette: 'cas_1', onEnd }), request(callIndex), pool, cassette, createRng('s'));
    expect(await select(2, 'error')).toMatchObject({ kind: 'selected', recording: { id: 'rec_b' }, reason: { mode: 'sequence', seq: 2 } });
    expect((await select(3, 'error')).kind).toBe('miss');
    expect(await select(3, 'loop')).toMatchObject({ recording: { id: 'rec_a' } });
    expect(await select(5, 'last')).toMatchObject({ recording: { id: 'rec_b' } });
    expect(await select(3, 'sample')).toMatchObject({ kind: 'selected', reason: { mode: 'sample' } });
  });
});
