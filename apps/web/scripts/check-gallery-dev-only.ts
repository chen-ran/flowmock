// Ported from Floway apps/web/scripts/check-gallery-dev-only.ts (MIT). See NOTICE.md.
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The WinUI gallery is scaffolding for judging `packages/ui/src/winui` against
// microsoft-ui-xaml: no navigation entry, English placeholder copy.
// `apps/web/src/routes.ts` therefore registers it only for a development mode,
// and that table is its only importer, so a production build should not reach
// the gallery's modules at all.
//
// That gate is one expression in a config file which does not run in the bundle
// it is gating, and it has already been written against the wrong flag once --
// `import.meta.env.DEV` reports the loader process's NODE_ENV rather than the
// build's mode. Reading the property off the build output is what makes the
// mistake unable to ship: whatever the gate says, the emitted assets either
// carry the gallery or they do not.
const clientDir = resolve(import.meta.dirname, '../dist/client');
const assetsDir = resolve(clientDir, 'assets');

const GALLERY_MODULES = ['/apps/web/src/routes/winui-gallery.tsx', '/packages/ui/src/gallery/gallery.tsx'];
// Rolldown emits a few helper chunks with no sourcemap, and a build with
// sourcemaps off would have none at all. The gallery's toaster id is a string
// literal, so it survives minification and stands in for the module list.
const GALLERY_CODE = 'winui-gallery-toaster';

const containsGallery = async (name: string): Promise<boolean> => {
  const map = await readFile(resolve(assetsDir, `${name}.map`), 'utf8').catch(() => undefined);
  if (map === undefined) return (await readFile(resolve(assetsDir, name), 'utf8')).includes(GALLERY_CODE);
  return (JSON.parse(map) as { sources: string[] }).sources.some(source => GALLERY_MODULES.some(module => source.endsWith(module)));
};

const assets = (await readdir(assetsDir)).filter(name => name.endsWith('.js'));
if (assets.length === 0) throw new Error('The build emitted no script asset');

const offenders: string[] = [];
for (const name of assets) if (await containsGallery(name)) offenders.push(name);
if (offenders.length > 0) {
  throw new Error(`The WinUI gallery reached the production build: ${offenders.join(', ')}`);
}

console.log(`The WinUI gallery is absent from all ${assets.length} script assets`);
