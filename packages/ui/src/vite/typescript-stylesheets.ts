// Ported from Floway apps/web/vite.config.ts (typescriptStylesheets) (MIT). See NOTICE.md.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { runnerImport } from 'vite';
import type { Plugin } from 'vite';

// Part of the app's CSS is authored in TypeScript, because its rules spend
// values the running app spends too: the WinUI layer interpolates the token
// names and motion durations that the same modules hand to Fluent, and the
// critical block interpolates the type stack the Fluent theme object is built
// from. Rendered straight into a <style> element that text never meets Vite's
// CSS pipeline -- it ships unminified, unhashed, and the larger of the two is
// re-sent in full with every HTML response.
//
// Each such module is therefore also reachable as a virtual .css module. The
// TypeScript is evaluated here and its string handed to Vite, which from that
// point treats it as an ordinary stylesheet: ?url emits a hashed, minified,
// cacheable asset and yields its URL, ?inline yields the minified text for a
// sheet that has to stay in the document.
//
// Vite performs the evaluation itself. runnerImport stands up a throwaway
// server environment, runs the module through the same resolver and transform
// pipeline the app is built with, and tears the environment down again, so
// there is no second toolchain to keep in agreement with the app's config and
// no registry that outlives the call:
// https://github.com/vitejs/vite/blob/v8.1.5/packages/vite/src/node/ssr/runnerImport.ts#L14-L48
// It is also what reports the files the module read. A virtual sheet has no
// imports of its own as far as the graph is concerned, so that list is the
// only thing connecting an edit deep in the graph to the id that has to be
// rebuilt. Nothing in these graphs may reach a module that expects a browser,
// since this runs in Node.
export interface TypescriptStylesheet {
  exportName: string;
  /** Absolute path of the module that exports the stylesheet string. */
  module: string;
}

export type TypescriptStylesheets = Record<`virtual:${string}.css`, TypescriptStylesheet>;

// An app that adds sheets of its own to the critical block points this id at a
// module that joins them with @flowmock/ui/critical.css.
export const FLOWMOCK_STYLESHEETS = {
  'virtual:flowmock-critical.css': { exportName: 'criticalCss', module: fileURLToPath(new URL('../critical.css.ts', import.meta.url)) },
  'virtual:flowmock-winui.css': { exportName: 'winuiCss', module: fileURLToPath(new URL('../winui/index.ts', import.meta.url)) },
} as const satisfies TypescriptStylesheets;

// ?url is a build-time contract: vite:css turns it into an emitted asset only
// while bundling, and both the asset and the CSS plugins skip the query
// otherwise. The dev server therefore serves the URL form from a path of this
// plugin's own, so that the document carries the same <link> in the same place
// in both modes rather than a style element in one and a link in the other.
const DEV_STYLESHEET_PATH = '/@flowmock/stylesheet/';

export const typescriptStylesheets = (sheets: TypescriptStylesheets): Plugin => {
  const rendered = new Map<string, string>();

  const specifierOf = (id: string) => (id.startsWith('\0') ? id.slice(1) : id).split('?', 1)[0]!;
  const sourceOf = (id: string): TypescriptStylesheet | undefined =>
    (sheets as Record<string, TypescriptStylesheet | undefined>)[specifierOf(id)];

  return {
    name: 'flowmock-typescript-stylesheets',
    resolveId(id) {
      // The resolved id keeps whatever query it arrived with, so vite:css still
      // sees ?url and ?inline on an id that ends in .css.
      return sourceOf(id) ? `\0${id.startsWith('\0') ? id.slice(1) : id}` : undefined;
    },
    async load(id) {
      const source = sourceOf(id);
      if (!id.startsWith('\0') || !source) return;
      const { module, dependencies } = await runnerImport<Record<string, string>>(source.module);
      // dependencies names everything the run read except the entry itself, so
      // the entry is added separately. Registering them makes the dev server
      // re-run this load when any of them changes, and makes the build watcher
      // treat them as inputs.
      this.addWatchFile(source.module);
      for (const file of dependencies) this.addWatchFile(file);
      const css = module[source.exportName];
      if (typeof css !== 'string') throw new TypeError(`${source.module} exports no string named ${source.exportName}.`);
      if (this.environment.mode !== 'dev' || !/[?&]url\b/.test(id)) return css;
      const specifier = specifierOf(id);
      rendered.set(specifier, css);
      // The query is what makes an edit visible: the module reloads, the element
      // re-renders with a new href, and the browser fetches the sheet again
      // instead of answering from its own cache. It is a hash of the sheet
      // rather than a clock, because a prerendered document is rendered twice --
      // once to prerender and once to hydrate -- and a clock reads differently
      // each time, which is a hydration mismatch on an element React owns.
      const version = createHash('sha256').update(css).digest('hex').slice(0, 8);
      return `export default ${JSON.stringify(`${DEV_STYLESHEET_PATH}${specifier}?v=${version}`)}`;
    },
    configureServer(server) {
      server.middlewares.use(DEV_STYLESHEET_PATH, (request, response, next) => {
        const css = rendered.get(decodeURIComponent(request.url!.slice(1).split('?', 1)[0]!));
        if (css === undefined) return next();
        response.setHeader('content-type', 'text/css');
        response.end(css);
      });
    },
  };
};
