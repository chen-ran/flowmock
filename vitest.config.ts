import { defineConfig } from 'vitest/config';

// Each project pins the time zone in its own config, so a run from that
// project's directory keeps it too.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
  },
});
