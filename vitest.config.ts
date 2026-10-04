import { defineConfig } from 'vitest/config';

// Every timestamp FlowMock persists is UTC; pinning the zone keeps a green run
// here a green run in CI.
export default defineConfig({
  test: {
    env: { TZ: 'UTC' },
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
  },
});
