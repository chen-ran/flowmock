// Ported from Floway apps/web/src/components/language-sync.tsx (MIT). See NOTICE.md.
import { useEffect } from 'react';

import { setLanguage } from '../i18n/index.ts';
import { browserLanguage, storedLanguage } from '@flowmock/ui/i18n';

// Hydration renders the default language to match the prerendered document;
// this moves the app to the reader's language right after.
export function LanguageSync() {
  useEffect(() => {
    void setLanguage(storedLanguage() ?? browserLanguage());
  }, []);

  return null;
}
