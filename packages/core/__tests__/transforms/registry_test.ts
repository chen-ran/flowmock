import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { compileTransforms, listTransforms, parseScenario, planReplay, registerTransform, TransformConfigError } from '../../src/index.ts';
import { MemoryCorpus } from '../support/fakes.ts';
import { fixtureRecording, prepareFixtureRequest } from '../support/fixtures.ts';
import { anthropicText } from '@flowmock/test-fixtures';

registerTransform({
  type: 'test-shout',
  stage: 'content',
  description: 'Upper-cases text deltas (test only).',
  schema: z.object({ marker: z.string().default('') }).strict(),
  apply: (draft, config) => {
    for (const frame of draft.frames) {
      if (!frame.content) continue;
      frame.raw = frame.raw.replace(/"text":"([^"]*)"/, (_match, text: string) => `"text":"${text.toUpperCase()}${config.marker}"`);
      frame.origin = 'rewritten';
    }
    draft.provenance.push({ transform: 'test-shout', detail: 'shouted' });
  },
});

describe('transform registry', () => {
  it('lists the built-in transforms', () => {
    expect(listTransforms().map(transform => transform.type)).toEqual(expect.arrayContaining(['rewrite', 'timing', 'interrupt', 'network']));
  });

  it('validates extra transform configuration', () => {
    expect(() => compileTransforms([{ type: 'nope' }])).toThrow(TransformConfigError);
    expect(() => compileTransforms([{ type: 'test-shout', marker: 3 }])).toThrow(/test-shout/);
    expect(compileTransforms([{ type: 'network', latencyMs: 5 }])[0].config).toMatchObject({ latencyMs: 5, jitterMs: 0 });
  });

  it('runs a registered transform in its stage and records provenance', async () => {
    const corpus = new MemoryCorpus().add(fixtureRecording(anthropicText));
    const outcome = await planReplay(prepareFixtureRequest(anthropicText), {
      scenario: parseScenario({ name: 'shout', transforms: [{ type: 'test-shout', marker: '!' }] }),
      callIndex: 1,
      seed: 's',
      nowMs: 0,
      scenarioElapsedMs: 0,
      inFlight: 1,
    }, corpus);
    const body = outcome.plan.writes.map(write => new TextDecoder().decode(write.bytes)).join('');
    expect(body).toContain('"text":"HELLO!"');
    expect(outcome.trace.provenance.map(entry => entry.transform)).toEqual(['rewrite', 'test-shout', 'timing']);
  });

  it('turns an invalid scenario transform into a FlowMock error response', async () => {
    const corpus = new MemoryCorpus().add(fixtureRecording(anthropicText));
    const outcome = await planReplay(prepareFixtureRequest(anthropicText), {
      scenario: parseScenario({ name: 'bad', transforms: [{ type: 'missing' }] }),
      callIndex: 1,
      seed: 's',
      nowMs: 0,
      scenarioElapsedMs: 0,
      inFlight: 1,
    }, corpus);
    expect(outcome.trace.error?.code).toBe('invalid_scenario');
  });
});
