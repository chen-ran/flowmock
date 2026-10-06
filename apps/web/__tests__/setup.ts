import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// The app's own i18n instance, initialized once for the whole run so that a
// suite querying by accessible name resolves the same strings the app renders.
import '../src/i18n/index.ts';

// Vitest runs without globals, so React Testing Library's automatic cleanup
// never arms itself.
afterEach(cleanup);

// happy-dom ships no FontFaceSet, while every engine the app runs in has one.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { ready: Promise.resolve() },
});
