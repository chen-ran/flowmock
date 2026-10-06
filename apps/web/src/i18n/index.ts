// Ported from Floway apps/web/src/i18n/{index,resources}.ts (MIT). See NOTICE.md.
import { shellResources } from './shell.ts';
import { initI18n, type SupportedLanguage } from '@flowmock/ui/i18n';

// One import() per locale, written out rather than derived from a template, so
// the bundler sees the whole set and gives each locale a chunk of its own. A
// visitor fetches the bundle for their own language and never the others.
const localeModules: Record<SupportedLanguage, () => Promise<{ default: { translation: object } }>> = {
  'en': async () => await import('./locales/en.ts'),
  'zh-Hans': async () => await import('./locales/zh-Hans.ts'),
};

export const loadLocale = async (language: SupportedLanguage) => (await localeModules[language]()).default;

// Awaited at module scope: everything that renders reaches i18next through
// here, so React cannot mount before the visitor's bundle is in hand and no
// render can meet a missing key.
export const { i18n, setLanguage } = await initI18n({ loadLocale, shell: shellResources });
