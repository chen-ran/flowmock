// Ported from Floway apps/web/src/components/charts/dashboard-time.ts (MIT). See NOTICE.md.

// The three ranges a time chart buckets by: the last 24 hours by the hour, the
// last week by four local hours, and the last 30 days by local day. Bucket keys
// are the hour or date a server's hourly rows are filed under, so a series can
// be laid onto the frames without knowing the reader's time zone.
export type TimeRange = 'today' | '7d' | '30d';

export interface BucketFrame {
  date: Date;
  key: string;
}

// The label is locale- and page-dependent, so the consumer supplies it.
export interface ChartBucket extends BucketFrame { label: string }

const pad2 = (value: number) => String(value).padStart(2, '0');
const localHourKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}`;
const utcHourKey = (date: Date) => date.toISOString().slice(0, 13);
const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const local4hStart = (date: Date) => {
  const aligned = new Date(date);
  aligned.setMinutes(0, 0, 0);
  aligned.setHours(aligned.getHours() - (aligned.getHours() % 4));
  return aligned;
};

export const bucketFrames = (range: TimeRange, nowMs: number): BucketFrame[] => {
  if (range === 'today') {
    const current = new Date(nowMs);
    current.setMinutes(0, 0, 0);
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(current.getTime() - (23 - index) * 3_600_000);
      return { key: utcHourKey(date), date };
    });
  }
  if (range === '7d') {
    const current = local4hStart(new Date(nowMs));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(current);
      date.setHours(date.getHours() - (41 - index) * 4);
      const aligned = local4hStart(date);
      return { key: localHourKey(aligned), date: aligned };
    });
  }
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(nowMs);
    date.setDate(date.getDate() - (29 - index));
    date.setHours(0, 0, 0, 0);
    return { key: localDateKey(date), date };
  });
};

export const bucketKeyForUtcHour = (range: TimeRange, hour: string) => {
  const date = new Date(`${hour}:00:00Z`);
  if (range === 'today') return hour;
  if (range === '7d') return localHourKey(local4hStart(date));
  return localDateKey(date);
};

export const chartTickValues = <T extends { date: Date }>(buckets: T[], desired = 7): T[] => {
  if (buckets.length <= 8) return buckets;
  const step = Math.ceil((buckets.length - 1) / (desired - 1));
  const ticks = buckets.filter((_, index) => index % step === 0);
  const last = buckets.at(-1);
  if (last && ticks.at(-1) !== last) ticks.push(last);
  return ticks;
};

// All three ranges go through `toLocaleString`: `toLocaleDateString` renders
// the hour too, but `hour: '2-digit'` under a 12-hour clock produces `04 AM`.
const AXIS_PARTS: Record<TimeRange, Intl.DateTimeFormatOptions> = {
  'today': { hour: '2-digit', minute: '2-digit' },
  '7d': { month: 'short', day: 'numeric', hour: 'numeric' },
  '30d': { month: 'short', day: 'numeric' },
};

export const formatAxisDate = (date: Date, range: TimeRange, locale: string) =>
  date.toLocaleString(locale, AXIS_PARTS[range]);

export const formatCalloutTitle = (
  value: Date | number | string,
  labels: ReadonlyMap<number, string>,
  range: TimeRange,
  locale: string,
) => value instanceof Date
  ? labels.get(value.getTime()) ?? formatAxisDate(value, range, locale)
  : typeof value === 'number' ? value.toLocaleString(locale) : value;
