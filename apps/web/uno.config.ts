import { defineConfig } from 'unocss';

import { presetFlowmock, UI_CONTENT_GLOBS } from '@flowmock/ui/uno';

// The PostCSS integration reads these globs itself and never sees the module
// graph, so a class only ships if a scanned file spells it out -- this app's
// sources and the controls it renders from @flowmock/ui alike. The .css.ts
// modules are CSS text and prose, not class attributes.
export default defineConfig({
  presets: [presetFlowmock()],
  content: {
    filesystem: ['src/**/*.{ts,tsx}', '!src/**/*.css.ts', ...UI_CONTENT_GLOBS],
  },
});
