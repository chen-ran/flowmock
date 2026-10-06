// Ported from Floway apps/web/src/lib/use-locale.ts (MIT). See NOTICE.md.
import { useTranslation } from '../i18n/translation.ts';
import { localeForLanguage } from '@flowmock/ui/i18n';

// i18n.language rather than i18n.resolvedLanguage, which is undefined until
// i18next has initialised and otherwise duplicates the fallback resolution
// localeForLanguage already performs.
export const useLocale = (): string => {
  const { i18n } = useTranslation();
  return localeForLanguage(i18n.language);
};
