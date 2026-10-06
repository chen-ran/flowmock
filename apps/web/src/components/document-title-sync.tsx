// Adapted from Floway apps/web/src/components/document-title-sync.tsx (MIT). See NOTICE.md.
import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { pageForPath } from './sidebar/pages.ts';
import { useTranslation } from '../i18n/translation.ts';

// The only writer of the document title. A route meta export cannot replace
// it: server rendering is off and the one prerendered route resolves no leaf,
// so meta reaches no static file and at runtime loses to this effect anyway,
// in English on a zh-Hans page.
export function DocumentTitleSync() {
  const location = useLocation();
  const { i18n, t } = useTranslation();

  useEffect(() => {
    const page = pageForPath(location.pathname);
    const title = location.pathname === '/login' ? t('auth.login.title') : page ? t(page.labelKey) : t('app.title');
    window.document.title = t('app.documentTitle', { title });
  }, [i18n.language, location.pathname, t]);

  return null;
}
