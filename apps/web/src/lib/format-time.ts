// Ported from Floway apps/web/src/lib/format-time.ts (MIT). See NOTICE.md.
import { NO_READING } from './no-reading.ts';

const toDate = (value: string | number): Date => new Date(value);

export const shortDate = (value: string | number | null | undefined, locale: string): string =>
  value === null || value === undefined
    ? NO_READING
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(toDate(value));

export const dateTime = (value: string | number | null | undefined, locale: string): string =>
  value === null || value === undefined
    ? NO_READING
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(toDate(value));

const RELATIVE_UNITS: [limitSeconds: number, perUnitSeconds: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86_400, 3600, 'hour'],
  [2_592_000, 86_400, 'day'],
];

// Null past 30 days, where callers read better with an absolute date.
// `now` is an argument so a list of rows answers to one tick of `useNow`.
export const relativeTime = (
  value: string | number,
  locale: string,
  { now, style = 'long' }: { now: number; style?: Intl.RelativeTimeFormatStyle },
): string | null => {
  const deltaSeconds = Math.round((toDate(value).getTime() - now) / 1000);
  const magnitude = Math.abs(deltaSeconds);
  const match = RELATIVE_UNITS.find(([limit]) => magnitude < limit);
  if (!match) return null;
  const [, perUnit, unit] = match;
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style }).format(Math.round(deltaSeconds / perUnit), unit);
};

// A row's timestamp, short enough for a table column: the date without the
// year, and the time to the second.
export const compactDateTime = (value: string | number | null | undefined, locale: string): string =>
  value === null || value === undefined
    ? NO_READING
    : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(toDate(value));
