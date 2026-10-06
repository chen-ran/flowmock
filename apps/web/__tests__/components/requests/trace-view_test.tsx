import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RequestDetail } from '../../../src/api/types.ts';
import { replayCurl } from '../../../src/components/requests/replay-snippet.ts';
import { timingRows } from '../../../src/components/requests/timing-compare.tsx';
import { ORIGIN_COLORS, traceDuration, traceMarks, TraceView } from '../../../src/components/requests/trace-view.tsx';
import { renderInApp } from '../../render.tsx';

type Trace = NonNullable<RequestDetail['trace']>;
const frame = (at: number, origin: string, content: boolean, label: string | null = null) => ({ at, origin, content, tokens: content ? 2 : 0, label, bytes: 40 }) as Trace['frames'][number];

const trace = {
  scenario: 'chaos', seed: '7337f28bdfced5b1', sessionId: 's0', callIndex: 3, fingerprint: 'f', selection: null, misses: [], recordingId: 'rec_1',
  fault: { rule: 3, type: 'interrupt' }, provenance: [], error: null,
  frames: [frame(200, 'rewritten', false, 'message_start'), frame(450, 'recorded', true), frame(470, 'injected', false, 'error')],
} as unknown as Trace;
const expected = { ttftMs: 452.5, tps: 778.8, durationMs: 465.5 };
const result = { outcome: 'interrupted', endMode: 'hang', headersAt: 204, firstByteAt: 206, firstContentAt: 454, lastContentAt: 466, endedAt: 15_468, bytesWritten: 752, writes: 5, achievedTtftMs: 454.5, achievedTps: 159.7, error: null } as NonNullable<RequestDetail['result']>;

describe('the trace view', () => {
  it('colours each frame by where its bytes came from', () => {
    const marks = traceMarks(trace.frames, () => ({ title: '', detail: '' }));
    expect(marks.map(mark => [mark.kind, mark.color])).toEqual([
      ['other', ORIGIN_COLORS.rewritten],
      ['content', ORIGIN_COLORS.recorded],
      ['error', ORIGIN_COLORS.injected],
    ]);
  });

  it('spans the frames and the end of the response', () => {
    expect(traceDuration({ trace, expected, result })).toBe(15_468);
    expect(traceDuration({ trace, expected: null, result: null })).toBe(470);
  });

  it('names the origins it shows and the planned and measured moments', () => {
    const { container } = renderInApp(<TraceView entry={{ trace, expected, result }} />);
    const legend = screen.getByRole('list', { name: 'Frame origins and moments' });
    expect(legend.textContent).toContain('Recorded');
    expect(legend.textContent).toContain('Rewritten');
    expect(legend.textContent).toContain('Injected');
    expect(legend.textContent).not.toContain('Collected');
    expect(screen.getByText('First token planned at 453ms')).toBeTruthy();
    expect(screen.getByText('First token sent at 455ms')).toBeTruthy();
    expect(screen.getByText('Hangs at 15.5s')).toBeTruthy();
    expect(container.querySelectorAll('[data-moment]')).toHaveLength(3);
  });
});

describe('the timing comparison', () => {
  it('puts what was planned beside what was measured', () => {
    expect(timingRows(expected, result)).toEqual([
      { metric: 'ttft', planned: '453ms', achieved: '455ms', difference: '+2ms' },
      { metric: 'tps', planned: '779 tok/s', achieved: '160 tok/s', difference: '−619 tok/s' },
      { metric: 'duration', planned: '466ms', achieved: '15.5s', difference: '+15.0s' },
    ]);
  });
});

describe('the replay snippet', () => {
  it('sends the request again under the same scenario, seed and session', () => {
    expect(replayCurl('http://127.0.0.1:8787', { path: '/v1/messages', protocol: 'anthropic-messages', trace })).toBe([
      'curl http://127.0.0.1:8787/v1/messages \\',
      '  -H "x-api-key: $FLOWMOCK_KEY" \\',
      "  -H 'anthropic-version: 2023-06-01' \\",
      "  -H 'content-type: application/json' \\",
      "  -H 'x-flowmock-scenario: chaos' \\",
      "  -H 'x-flowmock-seed: 7337f28bdfced5b1' \\",
      "  -H 'x-flowmock-session: s0' \\",
      '  --data @request.json',
    ].join('\n'));
    expect(replayCurl('http://h', { path: '/v1/chat/completions', protocol: 'openai-chat-completions', trace })).toContain('-H "authorization: Bearer $FLOWMOCK_KEY"');
    expect(replayCurl('http://h', { path: '/v1/messages', protocol: 'anthropic-messages', trace: null })).toBeNull();
  });
});
