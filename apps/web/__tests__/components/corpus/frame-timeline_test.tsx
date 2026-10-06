import { describe, expect, it } from 'vitest';

import { FrameTimeline } from '../../../src/components/corpus/frame-timeline.tsx';
import { frameMarks } from '../../../src/routes/corpus-detail.tsx';
import { renderInApp } from '../../render.tsx';

const frame = (t: number, overrides: Partial<Parameters<typeof frameMarks>[0][number]> = {}) => ({
  t, kind: 'sse' as const, event: 'content_block_delta', raw: `data: {"t":${t}}\n\n`, content: true, contentChars: 4, tokens: 1, error: null, ...overrides,
});

describe('the frame timeline', () => {
  it('places marks in arrival order along the duration', () => {
    const marks = frameMarks([frame(300), frame(100, { content: false, event: 'message_start' }), frame(200)]);
    const { container } = renderInApp(<FrameTimeline durationMs={400} label="Frames" marks={marks} />);
    const rects = [...container.querySelectorAll('rect[data-mark]')];
    expect(rects.map(rect => Number(rect.getAttribute('data-t')))).toEqual([100, 200, 300]);
    expect(rects.map(rect => rect.getAttribute('x'))).toEqual(['25%', '50%', '75%']);
    expect(rects.map(rect => rect.getAttribute('data-kind'))).toEqual(['other', 'content', 'content']);
  });

  it('marks an error frame, even one that also carries content', () => {
    const marks = frameMarks([frame(10), frame(20, { event: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } as never })]);
    const { container } = renderInApp(<FrameTimeline durationMs={20} label="Frames" marks={marks} />);
    const errors = [...container.querySelectorAll('rect[data-error]')];
    expect(errors).toHaveLength(1);
    expect(errors[0]!.getAttribute('data-t')).toBe('20');
  });

  it('keeps a frame preview to its first 200 characters', () => {
    const [mark] = frameMarks([frame(1, { raw: 'x'.repeat(500) })]);
    expect(mark!.detail).toBe(`${'x'.repeat(200)}…`);
  });
});
