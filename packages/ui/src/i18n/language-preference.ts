// Ported from Floway apps/web/src/i18n/language-preference.ts (MIT). See NOTICE.md.
import { normalizeLanguage, type SupportedLanguage } from './languages.ts';

export const flowmockLanguageStorageKey = 'flowmock-language';

// An explicit choice made in the page outranks the browser language, and has to
// survive reloads, so it lives in localStorage. Storage can be denied (Safari private browsing, a
// partitioned third-party context) and happy-dom ships none, so every access is
// guarded and the app just carries on unpersisted.
export const storedLanguage = (): SupportedLanguage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return normalizeLanguage(window.localStorage.getItem(flowmockLanguageStorageKey));
  } catch {
    return null;
  }
};

export const storeLanguage = (language: SupportedLanguage): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(flowmockLanguageStorageKey, language);
  } catch {
    // A denied or unavailable storage still allows the choice for this session;
    // it just does not survive the next reload.
  }
};

export const clearStoredLanguage = (): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(flowmockLanguageStorageKey);
  } catch {
    // As above.
  }
};
