import { screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { CassetteSequence, sequenceRows, sequenceScenarioYaml } from '../../../src/components/cassettes/sequence.tsx';
import { renderInApp } from '../../render.tsx';

const recording = (id: string, seq: number, createdAt: number, outcome = 'ok') => ({
  id, createdAt, protocol: 'anthropic-messages', transport: 'http', model: `model-${id}`, status: 200, wire: 'sse',
  features: { stream: true, outcome, stopReason: 'end_turn', inputTokens: 1, outputTokens: 1, toolCalls: 0, toolNames: [], reasoning: false, hasTools: false, requestToolNames: [], reasoningRequested: false, inputChars: 1, ttftMs: 100, tps: 10, durationMs: 200, responseModel: null, frames: 3, bytes: 10 },
  fingerprint: 'f', prefixHashes: [], sessionId: null, cassetteId: 'cas_1', cassetteSeq: seq,
}) as Parameters<typeof sequenceRows>[0][number];

describe('a cassette sequence', () => {
  const recordings = [recording('c', 3, 4_500), recording('a', 1, 1_000), recording('b', 2, 1_250, 'http_error:429')];

  it('runs in recorded order with the time since the recording before', () => {
    expect(sequenceRows(recordings).map(row => [row.recording.id, row.gapMs])).toEqual([['a', null], ['b', 250], ['c', 3250]]);
  });

  it('renders that order', () => {
    const router = createMemoryRouter([{ path: '*', element: <CassetteSequence recordings={recordings} /> }]);
    renderInApp(<RouterProvider router={router} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map(row => row.getAttribute('data-seq'))).toEqual(['1', '2', '3']);
    expect(within(rows[1]!).getByText('+250ms')).toBeTruthy();
    expect(within(rows[1]!).getByText('http_error:429')).toBeTruthy();
  });

  it('turns into a scenario that replays the cassette in order', () => {
    const yaml = sequenceScenarioYaml({ id: 'cas_01abc', name: 'Checkout flow #2' });
    expect(parse(yaml)).toEqual({
      name: 'seq-checkout-flow-2',
      selection: { mode: 'sequence', cassette: 'cas_01abc', onEnd: 'error' },
      timing: { mode: 'recorded' },
    });
    expect(yaml.startsWith('# Replays cassette "Checkout flow #2" (cas_01abc)')).toBe(true);
  });
});
