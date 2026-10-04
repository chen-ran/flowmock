// Ported from Floway apps/web/src/i18n/resources.ts (MIT). See NOTICE.md.
import type { SupportedLanguage } from './languages.ts';
import type en from './locales/en.ts';

export type UiTranslation = typeof en['translation'];

// One import() per locale, written out rather than derived from a template, so
// the bundler sees the whole set and gives each locale a chunk of its own. A
// visitor fetches the bundle for their own language and never the others.
const localeModules: Record<SupportedLanguage, () => Promise<{ default: { translation: { ui: object } } }>> = {
  'en': async () => await import('./locales/en.ts'),
  'zh-Hans': async () => await import('./locales/zh-Hans.ts'),
};

export const loadUiLocale = async (language: SupportedLanguage): Promise<{ translation: { ui: object } }> =>
  (await localeModules[language]()).default;
