import UnoCSS from '@unocss/postcss';
import { defineConfig } from 'vite';

import { presetFlowmock, UI_CONTENT_GLOBS } from '../src/uno/preset.ts';
import { FLOWMOCK_STYLESHEETS, legacyCssBuild, legacyCssColors, typescriptStylesheets } from '../src/vite/index.ts';

// A development-only page that mounts the controls the way an app does: the
// same stylesheet layers in the same order, the same utility pass and the same
// build policy. It is not part of the package's exports.
const root = import.meta.dirname;

export default defineConfig({
  root,
  build: {
    ...legacyCssBuild,
    outDir: 'dist',
    emptyOutDir: true,
  },
  css: {
    postcss: {
      plugins: [
        UnoCSS({
          cwd: root,
          configOrPath: {
            presets: [presetFlowmock()],
            content: { filesystem: [...UI_CONTENT_GLOBS, `${root}/**/*.tsx`] },
          },
        }),
        legacyCssColors,
      ],
    },
  },
  plugins: [typescriptStylesheets(FLOWMOCK_STYLESHEETS)],
});
