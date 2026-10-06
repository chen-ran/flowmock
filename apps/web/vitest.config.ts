import { defineConfig } from 'vitest/config';

import { stylesheets } from './stylesheets.ts';
import { prismComponentsEsm, typescriptStylesheets } from '@flowmock/ui/vite';

export default defineConfig({
  plugins: [prismComponentsEsm(), typescriptStylesheets(stylesheets)],
  // monaco-editor publishes only a module field, which the test environment's
  // resolver does not read by default.
  resolve: { mainFields: ['module', 'jsnext:main', 'jsnext'] },
  test: {
    include: ['__tests__/**/*_test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./__tests__/setup.ts'],
  },
});
