// Ported from Floway apps/web/src/critical.css.ts (MIT). See NOTICE.md.

import { gradientBackgroundCss } from './components/gradient-background.css.ts';
import { navigationProgressCss } from './components/navigation-progress.css.ts';
import { criticalCss as controlsCriticalCss } from '@flowmock/ui/critical.css';

// The package's block (the document rules, the loading screen and the error
// shell) joined with this app's own surfaces that paint before the linked
// WinUI stylesheet arrives. vite.config.ts serves this module as
// virtual:flowmock-critical.css and evaluates it in Node, so nothing here may
// reach a browser module.
export const criticalCss = [
  controlsCriticalCss,
  gradientBackgroundCss,
  navigationProgressCss,
].join('\n');
