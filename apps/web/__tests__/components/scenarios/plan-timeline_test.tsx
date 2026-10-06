import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PreviewPlan, PreviewTrace } from '../../../src/api/types.ts';
import { planDuration, planMarks, planMoments, PlanTimeline } from '../../../src/components/scenarios/plan-timeline.tsx';
import { renderInApp } from '../../render.tsx';

const write = (at: number, frame: number, content: boolean): PreviewPlan['writes'][number] => ({ at, frame, content, bytes: 10, text: `frame ${frame}` });

const basePlan: PreviewPlan = {
  transport: 'http',
  status: 200,
  headers: [],
  headersAt: 80,
  end: { mode: 'reset', at: 1500 },
  expected: { ttftMs: 800, tps: 60, durationMs: 1500 },
  outputTokens: 20,
  writes: [write(100, 0, false), write(820, 1, true), write(900, 2, true)],
};

const frame = (origin: PreviewTrace['frames'][number]['origin']): PreviewTrace['frames'][number] => ({ at: 0, origin, content: true, tokens: 1, label: null, bytes: 10 });
const baseTrace = { frames: [frame('recorded'), frame('recorded'), frame('injected')] } as PreviewTrace;

describe('the plan timeline', () => {
  it('tells content writes from the rest, and injected frames from both', () => {
    expect(planMarks(basePlan, baseTrace, () => '').map(mark => mark.kind)).toEqual(['other', 'content', 'error']);
  });

  it('marks every write of a refused response as an error', () => {
    expect(planMarks({ ...basePlan, status: 429 }, baseTrace, () => '').map(mark => mark.kind)).toEqual(['error', 'error', 'error']);
  });

  it('spans every write and moment', () => {
    expect(planDuration(basePlan)).toBe(1500);
    expect(planDuration({ ...basePlan, end: { mode: 'complete', at: 0 }, expected: { ...basePlan.expected, ttftMs: 2000 } })).toBe(2000);
  });

  it('draws the status line, the expected first token and the end, toning an abnormal end', () => {
    const moments = planMoments(basePlan);
    expect(moments.map(moment => [moment.id, moment.t])).toEqual([['headers', 80], ['ttft', 800], ['end', 1500]]);
    expect(moments.at(-1)!.color).toBe('var(--winui-system-fill-critical)');
    expect(planMoments({ ...basePlan, expected: { ...basePlan.expected, ttftMs: null } }).map(moment => moment.id)).toEqual(['headers', 'end']);
  });

  it('names each moment in its legend', () => {
    const { container } = renderInApp(<PlanTimeline plan={basePlan} trace={baseTrace} />);
    expect(screen.getByText('Status line at 80ms')).toBeTruthy();
    expect(screen.getByText('Expected first token at 800ms')).toBeTruthy();
    expect(screen.getByText('Resets at 1.5s')).toBeTruthy();
    expect([...container.querySelectorAll('[data-moment]')].map(node => (node as HTMLElement).style.left)).toEqual([`${(80 / 1500) * 100}%`, `${(800 / 1500) * 100}%`, '100%']);
  });
});
