import { describe, expect, it } from 'vitest';

import { liveTicks } from '../../../src/components/monitor/live-chart.tsx';

const at = (minutes: number, seconds = 0) => Date.UTC(2026, 9, 7, 7, minutes, seconds);
const times = (ticks: Date[]) => ticks.map(tick => tick.toISOString().slice(14, 19));

describe('live chart ticks', () => {
  it('labels a few seconds of data in round seconds', () => {
    const { seconds, ticks } = liveTicks(at(42, 13), at(42, 52));
    expect(seconds).toBe(true);
    expect(times(ticks)).toEqual(['42:20', '42:30', '42:40', '42:50']);
  });

  it('labels ten minutes in round minutes', () => {
    const { seconds, ticks } = liveTicks(at(30, 7), at(40, 7));
    expect(seconds).toBe(false);
    expect(times(ticks)).toEqual(['32:00', '34:00', '36:00', '38:00', '40:00']);
  });

  it('labels a single snapshot by its own time', () => {
    expect(times(liveTicks(at(42, 13), at(42, 13)).ticks)).toEqual(['42:13']);
  });
});
