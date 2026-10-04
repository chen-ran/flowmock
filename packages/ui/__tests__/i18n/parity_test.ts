import { describe, expect, it } from 'vitest';

import { assertLocaleParity } from '../../src/i18n/parity.ts';

const reference = {
  translation: {
    page: {
      title: 'Recordings',
      count_one: '{{count, count}} recording',
      count_other: '{{count, count}} recordings',
      greeting: 'Hello, <strong>{{name}}</strong>',
    },
  },
};

const candidate = {
  translation: {
    page: {
      title: '录制',
      count_other: '{{count, count}} 条录制',
      greeting: '你好，<strong>{{name}}</strong>',
    },
  },
};

const withPage = (page: Record<string, string>) => ({ translation: { page: { ...candidate.translation.page, ...page } } });

describe('assertLocaleParity', () => {
  it('accepts a locale whose plural categories differ but whose structure matches', () => {
    expect(() => assertLocaleParity(reference, candidate)).not.toThrow();
  });

  it('names a key the candidate lacks and a key the reference lacks', () => {
    const { title: _title, ...rest } = candidate.translation.page;
    expect(() => assertLocaleParity(reference, { translation: { page: rest } })).toThrow(/page\.title/);
    expect(() => assertLocaleParity(reference, withPage({ extra: '多余' }))).toThrow(/page\.extra/);
  });

  it('requires the other form of every plural key', () => {
    const { count_other: _other, ...rest } = candidate.translation.page;
    expect(() => assertLocaleParity(reference, { translation: { page: { ...rest, count_one: '{{count, count}}' } } }))
      .toThrow(/page\.count_other/);
  });

  it('rejects a changed placeholder or format', () => {
    expect(() => assertLocaleParity(reference, withPage({ greeting: '你好，<strong>{{user}}</strong>' }))).toThrow(/page\.greeting/);
    expect(() => assertLocaleParity(reference, withPage({ count_other: '{{count}} 条录制' }))).toThrow(/page\.count/);
  });

  it('rejects a changed rich-text tag', () => {
    expect(() => assertLocaleParity(reference, withPage({ greeting: '你好，{{name}}' }))).toThrow(/page\.greeting/);
  });
});
