// Ported from Floway apps/web/vite.config.ts and apps/web/postcss.config.ts (MIT). See NOTICE.md.
import { toLegacyCssColor } from '../lib/legacy-css-color.ts';

// The CSS pipeline and the client minifier must carry the same pre-Color-Level-4
// policy: Chrome 61 predates alpha hex, and esbuild uses that target to
// serialize alpha with legacy rgba(). An app that builds per environment states
// it on each one.
// https://vite.dev/config/build-options.html#build-csstarget
export const legacyCssBuild = {
  cssMinify: 'esbuild',
  cssTarget: 'chrome61',
} as const;

// The same policy for the stylesheets PostCSS sees, which include the UnoCSS
// utilities and the ones written by hand.
export const legacyCssColors = {
  postcssPlugin: 'flowmock-legacy-css-colors',
  Declaration: (declaration: { value: string }) => {
    declaration.value = toLegacyCssColor(declaration.value);
  },
  AtRule: (rule: { params: string }) => {
    rule.params = toLegacyCssColor(rule.params);
  },
};
