// Ported from Floway apps/web/src/lib/format-number.ts (MIT). See NOTICE.md.
import { NO_READING } from './no-reading.ts';

export const formatNumber = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(value);

// Rounded to whole tokens: an apportioned or estimated count carries no
// meaningful fraction.
export const formatTokens = (value: number | null, locale: string): string =>
  value === null || !Number.isFinite(value) ? NO_READING : formatNumber(Math.round(value), locale);

const decimals = (value: number, maximumFractionDigits: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);

// Two fraction digits at the top of the ladder keep the whole range at three significant figures.
export const formatBytes = (value: number, locale: string): string => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${decimals(value / 1024, value < 10 * 1024 ? 1 : 0, locale)} KB`;
  if (value < 1024 ** 3) return `${decimals(value / 1024 ** 2, value < 10 * 1024 ** 2 ? 1 : 0, locale)} MB`;
  return `${decimals(value / 1024 ** 3, 2, locale)} GB`;
};

// Three significant figures across the range, so a column of rates stays comparable digit by digit.
export const formatTokenRate = (tokensPerSecond: number | null): string => {
  if (tokensPerSecond === null || !Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return NO_READING;
  if (tokensPerSecond >= 100) return `${Math.round(tokensPerSecond)} tok/s`;
  if (tokensPerSecond >= 10) return `${tokensPerSecond.toFixed(1)} tok/s`;
  return `${tokensPerSecond.toFixed(2)} tok/s`;
};
