import { describe, expect, it } from 'vitest';

import { cumulativeTokens } from '../../../src/components/corpus/token-curve.tsx';

describe('cumulativeTokens', () => {
  it('steps up at each content frame and ends at the apportioned total', () => {
    const points = cumulativeTokens([
      { t: 50, tokens: 0 },
      { t: 300, tokens: 12.5 },
      { t: 120, tokens: 7.5 },
      { t: 400, tokens: 0 },
    ]);
    expect(points).toEqual([
      { t: 0, tokens: 0 },
      { t: 120, tokens: 0 },
      { t: 120, tokens: 7.5 },
      { t: 300, tokens: 7.5 },
      { t: 300, tokens: 20 },
    ]);
    expect(points.at(-1)!.tokens).toBe(20);
  });

  it('stays flat for a recording with no output', () => {
    expect(cumulativeTokens([{ t: 10, tokens: 0 }])).toEqual([{ t: 0, tokens: 0 }]);
  });
});
