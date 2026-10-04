// Adapted from Floway apps/web/__tests__/i18n/resources_test.ts (MIT). See NOTICE.md.
import { describe, expect, it } from 'vitest';

import { supportedLanguages } from '../../src/i18n/languages.ts';
import { numberFormats } from '../../src/i18n/number-format.ts';
import { assertLocaleParity, leafEntries } from '../../src/i18n/parity.ts';
import { loadUiLocale } from '../../src/i18n/resources.ts';

// Assembled through the same loader map the app uses rather than from a list
// kept here, which could fall behind a locale somebody added.
const locales = await Promise.all(
  supportedLanguages.map(async language => [language, await loadUiLocale(language)] as const),
);
const english = locales.find(([language]) => language === 'en')![1];

const formatNames = (value: string): string[] =>
  [...value.matchAll(/\{\{[^},]+,\s*([^}]+?)\s*\}\}/g)].map(([, name]) => name!);

describe('the control strings', () => {
  it('live under the ui namespace alone', () => {
    for (const [language, resource] of locales) {
      expect(Object.keys(resource.translation), language).toEqual(['ui']);
    }
  });

  it('keep every locale aligned with English', () => {
    for (const [language, resource] of locales) {
      expect(() => assertLocaleParity(english, resource), language).not.toThrow();
    }
  });

  // The formatter module throws on an unregistered name, but only for a key
  // that actually renders, so a typo can sit in a rarely-opened dialog.
  it('name a registered format at every interpolation that asks for one', () => {
    for (const [language, resource] of locales) {
      for (const [key, value] of leafEntries(resource)) {
        for (const name of formatNames(value)) {
          expect(Object.keys(numberFormats), `${language}: ${key}`).toContain(name);
        }
      }
    }
  });
});
