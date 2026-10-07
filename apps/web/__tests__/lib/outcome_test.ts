import { describe, expect, it } from 'vitest';

import { outcomeTone, requestOutcomeTone, statusTone } from '../../src/lib/outcome.ts';

describe('outcome tones', () => {
  it('tones a recording by what its outcome says', () => {
    expect(outcomeTone('ok')).toBe('success');
    expect(outcomeTone('http_error:429')).toBe('danger');
    expect(outcomeTone('stream_error:overloaded_error')).toBe('warning');
    expect(outcomeTone('client_aborted')).toBe('neutral');
  });

  it('tones a status by its class', () => {
    expect([200, 302, 429, 529, null].map(statusTone)).toEqual(['success', 'success', 'warning', 'danger', 'neutral']);
  });

  it('never shows a refused request as a green outcome', () => {
    // A replay of a recorded 529 runs to completion: the run completed, the client was refused.
    expect(requestOutcomeTone('completed', 529)).toBe('danger');
    expect(requestOutcomeTone('completed', 429)).toBe('warning');
    expect(requestOutcomeTone('completed', 200)).toBe('success');
    expect(requestOutcomeTone('interrupted', 200)).toBe('warning');
    expect(requestOutcomeTone('failed', 200)).toBe('danger');
    expect(requestOutcomeTone('client_aborted', 503)).toBe('neutral');
  });
});
