import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*_test.ts'],
    environment: 'node',
    // Integration suites bind real sockets and replay real-time schedules.
    testTimeout: 30_000,
  },
});
