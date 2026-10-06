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

// Node's own localStorage global shadows the one the DOM environment installs,
// and it is inert unless the runtime was started with a store to back it, so
// getItem is simply absent. The environment's own implementation is left alone
// wherever it works.
if (typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() { return store.size; },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => { store.delete(key); },
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
    },
  });
}
