// Adapted from Floway apps/web/__tests__/i18n/{keys,resources_test}.ts (MIT). See NOTICE.md.

// i18next appends a CLDR plural category to the key, and the categories a
// language has are a fact about that language: English distinguishes one from
// other, Chinese has only other. So the leaf that backs t('x.count') is
// x.count_one / x.count_other rather than x.count, and comparing raw keys across
// locales would demand every locale carry English's categories.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

export const pluralBase = (key: string): string => key.replace(PLURAL_SUFFIX, '');

export const isPlural = (key: string): boolean => PLURAL_SUFFIX.test(key);

// The resource tree flattened to the dotted paths i18next resolves, each mapped
// to the string it answers with.
export const leafEntries = (value: object, prefix = ''): Map<string, string> =>
  new Map(
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof child === 'object' && child !== null
        ? [...leafEntries(child as object, path)]
        : [[path, String(child)] as const];
    }),
  );

const interpolations = (value: string): string[] =>
  [...value.matchAll(/\{\{[^}]+\}\}/g)].map(([match]) => match).sort();

const tags = (value: string): string[] =>
  [...value.matchAll(/<\/?[^>]+>/g)].map(([match]) => match).sort();

const sameList = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

// A candidate locale agrees with the reference when it has the same keys up to
// plural category, the other form of every plural key, and in every string the
// same placeholders (formats included) and the same rich-text tags. Every
// disagreement is collected before throwing, so one run names them all.
export const assertLocaleParity = (reference: object, candidate: object): void => {
  const expected = leafEntries(reference);
  const actual = leafEntries(candidate);
  const problems: string[] = [];

  const expectedBases = new Set([...expected.keys()].map(pluralBase));
  const actualBases = new Set([...actual.keys()].map(pluralBase));
  for (const base of expectedBases) if (!actualBases.has(base)) problems.push(`${base}: missing`);
  for (const base of actualBases) if (!expectedBases.has(base)) problems.push(`${base}: not in the reference`);

  for (const base of new Set([...actual.keys()].filter(isPlural).map(pluralBase))) {
    if (!actual.has(`${base}_other`)) problems.push(`${base}_other: missing the other form`);
  }

  for (const [key, value] of actual) {
    const reference = expected.get(key) ?? expected.get(`${pluralBase(key)}_other`);
    if (reference === undefined) continue;
    if (!sameList(interpolations(value), interpolations(reference))) problems.push(`${key}: placeholders differ from the reference`);
    if (!sameList(tags(value), tags(reference))) problems.push(`${key}: rich-text tags differ from the reference`);
  }

  if (problems.length > 0) throw new Error(`Locales disagree:\n${problems.join('\n')}`);
};
