// Adapted from Floway apps/web/__tests__/components/charts/dashboard-time_test.ts (MIT). See NOTICE.md.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { bucketFrames, bucketKeyForUtcHour, chartTickValues, formatAxisDate } from '../../src/charts/time-axis.ts';

// Frames are local by design, so every case names the zone it reads them in.
beforeEach(() => vi.stubEnv('TZ', 'UTC'));
afterEach(() => vi.unstubAllEnvs());

test('today keeps both repeated local hours as distinct frames', () => {
  vi.stubEnv('TZ', 'America/New_York');

  const frames = bucketFrames('today', Date.UTC(2026, 10, 1, 7, 30));
  const repeatedHour = frames.filter(({ date }) => (
    date.getFullYear() === 2026
    && date.getMonth() === 10
    && date.getDate() === 1
    && date.getHours() === 1
  ));

  expect(repeatedHour.map(frame => frame.key)).toEqual(['2026-11-01T05', '2026-11-01T06']);
  expect(new Set(frames.map(frame => frame.key)).size).toBe(24);
});

describe('bucket frames', () => {
  test('cover each range with frames ending at the current one', () => {
    const now = Date.UTC(2026, 9, 5, 9, 30);
    expect(bucketFrames('today', now)).toHaveLength(24);
    expect(bucketFrames('7d', now)).toHaveLength(42);
    expect(bucketFrames('30d', now)).toHaveLength(30);
    expect(bucketFrames('30d', now).at(-1)!.key).toBe('2026-10-05');
  });

  test('file a UTC hour under the frame that holds it', () => {
    expect(bucketKeyForUtcHour('today', '2026-10-05T09')).toBe('2026-10-05T09');
    expect(bucketKeyForUtcHour('7d', '2026-10-05T09')).toBe('2026-10-05T08');
    expect(bucketKeyForUtcHour('30d', '2026-10-05T09')).toBe('2026-10-05');
  });
});

describe('ticks and labels', () => {
  test('thin a long axis but always keep its last bucket', () => {
    const buckets = bucketFrames('30d', Date.UTC(2026, 9, 5));
    const ticks = chartTickValues(buckets);
    expect(ticks[0]).toBe(buckets[0]);
    expect(ticks.at(-1)).toBe(buckets.at(-1));
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(chartTickValues(buckets.slice(0, 8))).toHaveLength(8);
  });

  test('label a frame for its range in the given locale', () => {
    const date = new Date(Date.UTC(2026, 9, 5, 14));
    expect(formatAxisDate(date, '30d', 'en-US')).toBe('Oct 5');
    expect(formatAxisDate(date, 'today', 'en-US')).toBe('02:00 PM');
  });
});
