// Ported from Floway apps/web/src/lib/format-number.ts (MIT). See NOTICE.md.
const decimals = (value: number, maximumFractionDigits: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);

// Two fraction digits at the top of the ladder keep the whole range at three significant figures.
export const formatBytes = (value: number, locale: string): string => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${decimals(value / 1024, value < 10 * 1024 ? 1 : 0, locale)} KB`;
  if (value < 1024 ** 3) return `${decimals(value / 1024 ** 2, value < 10 * 1024 ** 2 ? 1 : 0, locale)} MB`;
  return `${decimals(value / 1024 ** 3, 2, locale)} GB`;
};

export const formatNumber = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(value);

// Clamped at zero: a negative tally is an arithmetic artifact, not a quantity.
export const formatCount = (value: number, locale: string): string =>
  formatNumber(Math.max(0, Math.round(value)), locale);
