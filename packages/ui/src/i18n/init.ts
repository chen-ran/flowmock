// Ported from Floway apps/web/src/i18n/index.ts (MIT). See NOTICE.md.
import i18next from 'i18next';
import type { i18n as I18n, Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { storedLanguage } from './language-preference.ts';
import { browserLanguage, defaultLanguage, htmlLanguageFor, supportedLanguages } from './languages.ts';
import type { SupportedLanguage } from './languages.ts';
import { numberFormatter } from './number-format.ts';
import { loadUiLocale } from './resources.ts';

export interface InitI18nOptions {
  /** Fetches the app's own bundle for one language, shaped { translation: {...} }. */
  loadLocale: (language: SupportedLanguage) => Promise<Resource[string]>;
  /** The strings a prerendered document needs before any bundle has arrived. */
  shell: Resource[string];
  /** The global instance react-i18next binds unless a suite boots its own. */
  instance?: I18n;
}

export interface I18nRuntime {
  i18n: I18n;
  setLanguage: (next: SupportedLanguage) => Promise<void>;
}

// Translation data is the larger part of what an app has to load before it can
// paint, and half of that again is a language the visitor is not reading, so
// each locale is fetched on its own. That makes the strings asynchronous, and
// the app awaits this rather than handing out a promise: everything that
// renders reaches i18next through it, so React cannot mount -- and a
// prerendered boot screen cannot be replaced -- before the bundle is in hand,
// and no render can meet a missing key.
//
// Hydration is the one render that cannot be in the visitor's language: it has
// to reproduce a document prerendered in the default language. So the active
// language starts as the default with only the shell's strings behind it, while
// fallbackLng names the language the visitor will read -- an explicit in-page
// choice, or the browser language before one has been made -- and carries the
// bundle loaded here. Every key outside the shell resolves through that
// fallback, which puts whatever renders between hydration and the app's
// language sync in the visitor's language rather than briefly in English.
//
// Every bundle is the app's merged with this package's ui namespace, so the
// controls resolve their own strings from the same instance.
//
// A module reload in development -- Vite's, in the browser and in the dev
// server that prerenders the document -- evaluates the app's i18n module again
// against the instance it already initialized. A second call initializes that
// instance again with the bundles the reloaded module brings, registering its
// plugins and listener only the first time.
export const initI18n = async ({ loadLocale, shell, instance = i18next }: InitI18nOptions): Promise<I18nRuntime> => {
  const i18n = instance;
  const first = !i18n.isInitialized;

  const loadBundle = async (language: SupportedLanguage): Promise<Resource[string]> => {
    const [app, ui] = await Promise.all([loadLocale(language), loadUiLocale(language)]);
    return { ...app, translation: { ...app.translation as object, ...ui.translation } };
  };

  const language = storedLanguage() ?? browserLanguage();
  const loaded = new Set<SupportedLanguage>([language]);

  if (first) i18n.use(numberFormatter).use(initReactI18next);
  await i18n.init({
    resources: { [defaultLanguage]: shell, [language]: await loadBundle(language) },
    lng: defaultLanguage,
    fallbackLng: language,
    supportedLngs: [...supportedLanguages],
    interpolation: {
      escapeValue: false,
      alwaysFormat: true,
    },
  });

  if (first) {
    i18n.on('languageChanged', language => {
      if (typeof window !== 'undefined') {
        window.document.documentElement.lang = htmlLanguageFor(language);
      }
    });
  }

  // The way the app changes language. A bare changeLanguage would reach a
  // language whose bundle was never fetched, and the default language is
  // present from boot carrying the shell's strings alone. Persisting the choice
  // is the caller's job: boot sync and tests also call this, and neither is an
  // explicit in-page choice.
  const setLanguage = async (next: SupportedLanguage): Promise<void> => {
    if (!loaded.has(next)) {
      i18n.addResourceBundle(next, 'translation', (await loadBundle(next)).translation, true, true);
      loaded.add(next);
    }
    await i18n.changeLanguage(next);
  };

  return { i18n, setLanguage };
};
