// Ported from Floway apps/web/src/critical.css.ts (MIT). See NOTICE.md.
import { errorShellCss } from './controls/error-shell.css.ts';
import { loadingCss } from './controls/loading-screen.css.ts';
import { baseFontStack } from './font-stacks.ts';

// Fluent scopes its tokens to the FluentProvider element, so <body>, the
// loading screen and the error shell see no --fontFamilyBase unless it is
// published at the document root.
//
// The colour scheme is declared on the same condition useSystemTheme in
// ./theme.ts picks the Fluent theme from, and on no other: the app follows the
// system and offers no override, so one query switches both the theme and the
// user agent surfaces -- scrollbars, native controls, the canvas behind the
// first paint.
//
// The stylesheet plugin in ./vite evaluates this graph in Node, so nothing here
// may reach a browser module.
const documentCss = `
html, body { height: 100%; overflow: hidden; }
body { margin: 0; }
@media (prefers-color-scheme: dark) { html { color-scheme: dark; } }
*, *::before, *::after { box-sizing: border-box; }
:root { --fontFamilyBase: ${baseFontStack}; }
body { font-family: var(--fontFamilyBase); }
`;

export const criticalCss = [
  documentCss,
  loadingCss,
  errorShellCss,
].join('\n');
