import { describe, expect, it } from 'vitest';

import { loadLocale } from '../../src/i18n/index.ts';
import en from '../../src/i18n/locales/en.ts';
import { assertLocaleParity, supportedLanguages } from '@flowmock/ui/i18n';

// Every locale the app can load, through the loader it uses, so a locale added
// to the language list is held to English the day it lands.
describe('locale parity', () => {
  it.each(supportedLanguages)('%s carries every English string, placeholder and tag', async language => {
    const locale = await loadLocale(language);
    expect(() => assertLocaleParity(en, locale)).not.toThrow();
  });
});
