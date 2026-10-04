import { defineConfig } from 'vitest/config';

import { prismComponentsEsm } from './src/vite/prism-components.ts';

export default defineConfig({
  plugins: [prismComponentsEsm()],
  test: {
    include: ['__tests__/**/*_test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./__tests__/setup.ts'],
  },
});
