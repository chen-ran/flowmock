import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every timestamp FlowMock persists is UTC; a pinned zone keeps a green run
    // here a green run in CI.
    env: { TZ: 'UTC' },
    include: ['__tests__/**/*_test.ts'],
    environment: 'node',
    // Integration suites bind real sockets and replay real-time schedules.
    testTimeout: 30_000,
  },
});
