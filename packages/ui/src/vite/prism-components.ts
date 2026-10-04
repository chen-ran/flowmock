// Ported from Floway apps/web/vite.config.ts (prismComponentsEsm) (MIT). See NOTICE.md.
import MagicString from 'magic-string';
import type { Plugin } from 'vite';

// Prism ships its language components as scripts that mutate a global Prism
// rather than as modules. Prepending the import supplies that required binding:
// https://github.com/PrismJS/prism/blob/76dde18a575831c91491895193f56081ac08b0c5/components/prism-json.js#L1-L27
export const prismComponentsEsm = (): Plugin => ({
  name: 'prism-components-esm',
  enforce: 'pre',
  transform(code, id) {
    const path = id.split('?', 1)[0]!.replaceAll('\\', '/');
    if (!/\/prismjs\/components\/prism-[^/]+\.js$/.test(path)) return;
    const transformed = new MagicString(code);
    transformed.prepend('import Prism from "prismjs";\n');
    return {
      code: transformed.toString(),
      map: transformed.generateMap({ hires: true, includeContent: true, source: id }),
    };
  },
});

// The language scripts ../controls/prism.ts registers. The dependency optimizer
// does not run plugin transforms, so pre-bundling them -- which the scanner
// would do on its own for a bare specifier -- would hand the browser the
// untransformed script and leave it to find Prism on the window. An app lists
// these in optimizeDeps.exclude to keep them on the plugin pipeline in dev, as
// they already are in the build. The list mirrors that module's imports.
export const PRISM_COMPONENTS = [
  'prismjs/components/prism-bash',
  'prismjs/components/prism-json',
  'prismjs/components/prism-markdown',
  'prismjs/components/prism-powershell',
  'prismjs/components/prism-toml',
  'prismjs/components/prism-typescript',
] as const;
