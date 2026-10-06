// Ported from Floway apps/web/postcss.config.ts (MIT). See NOTICE.md.
import UnoCSS from '@unocss/postcss';

import { legacyCssColors } from '@flowmock/ui/vite';

// UnoCSS generates through PostCSS rather than unocss/vite, whose global mode
// emits nothing under React Router: it keys its vite:css-post handle by the
// top-level build.outDir, while React Router sets outDir only per environment.
// https://github.com/unocss/unocss/issues/4990
//
// cwd resolves both uno.config.ts discovery and the content globs, and defaults
// to the build process's working directory. Pinning it keeps a build launched
// from the workspace root scanning the same files as one launched from here.
export default { plugins: [UnoCSS({ cwd: import.meta.dirname }), legacyCssColors] };
