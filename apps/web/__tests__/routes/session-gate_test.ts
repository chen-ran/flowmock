// Ported from Floway apps/web/__tests__/routes/session-gate_test.ts (MIT). See NOTICE.md.
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { describe, expect, it } from 'vitest';

import routeConfig from '../../src/routes.ts';

// Read as text rather than imported: what is asserted is the module's shape,
// and importing a route would pull the whole component tree in with it.
const routeSources = import.meta.glob<string>('../../src/routes/*.tsx', { query: '?raw', import: 'default', eager: true });

const routeFiles = (entries: readonly RouteConfigEntry[]): string[] =>
  entries.flatMap(entry => [entry.file, ...routeFiles(entry.children ?? [])]);

// ./guards.ts states the convention: a page gates itself in its own
// clientLoader rather than leaning on the layout route's. A page that ships no
// loader at all is the one shape that cannot honour it.
describe('route gates', () => {
  it('gives every route its own client loader', () => {
    for (const file of routeFiles(routeConfig)) {
      const source = routeSources[`../../src/${file}`];
      expect(source, file).toBeDefined();
      expect(source, file).toMatch(/export (?:async )?function clientLoader\b/);
    }
  });
});
