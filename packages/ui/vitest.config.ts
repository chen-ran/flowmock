import { defineConfig } from 'vitest/config';

import { prismComponentsEsm } from './src/vite/prism-components.ts';

export default defineConfig({
  plugins: [prismComponentsEsm()],
  // monaco-editor publishes only a module field, which the test environment's
  // resolver does not read by default.
  resolve: { mainFields: ['module', 'jsnext:main', 'jsnext'] },
  test: {
    // Every timestamp FlowMock persists is UTC; a pinned zone keeps a green run
    // here a green run in CI.
    env: { TZ: 'UTC' },
    include: ['__tests__/**/*_test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./__tests__/setup.ts'],
  },
});
