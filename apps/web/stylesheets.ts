import { resolve } from 'node:path';

import { FLOWMOCK_STYLESHEETS, type TypescriptStylesheets } from '@flowmock/ui/vite';

// The app's critical block joins the package's with the sheets of its own
// components that have to be true before the linked stylesheet arrives. Shared
// by the build and the test config, so a suite renders the root route with the
// same virtual sheets the app ships.
export const stylesheets = {
  ...FLOWMOCK_STYLESHEETS,
  'virtual:flowmock-critical.css': { exportName: 'criticalCss', module: resolve(import.meta.dirname, 'src/critical.css.ts') },
} satisfies TypescriptStylesheets;
