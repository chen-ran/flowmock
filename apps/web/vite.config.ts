// Ported from Floway apps/web/vite.config.ts (MIT). See NOTICE.md.
import { isBuiltin } from 'node:module';

import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, type Plugin } from 'vite';

import { stylesheets } from './stylesheets.ts';
import {
  legacyCssBuild,
  PRISM_COMPONENTS,
  prismComponentsEsm,
  typescriptStylesheets,
} from '@flowmock/ui/vite';

// Every path apps/server answers itself, so the dev server forwards them and
// the SPA calls relative URLs in both dev and prod. Kept in step with
// isServerPath in apps/server/src/static-web.ts.
const serverPaths = ['/api', '/metrics', '/v1', '/v1beta', '/messages', '/chat/completions', '/responses', '/models'];

// Both ends are overridable so a second checkout can claim its own pair of
// ports without editing this file.
const serverOrigin = process.env.FLOWMOCK_DEV_SERVER ?? 'http://127.0.0.1:8787';
const webPort = Number(process.env.FLOWMOCK_DEV_WEB_PORT ?? '5175');

// Restoring a position needs mappings, sources and names; sourcesContent is
// the original text, which nothing here reads. The build checks read the maps
// to derive chunk membership.
// https://github.com/rolldown/rolldown/blob/872b98ac7476eb7d5892a2913e4ba010d124c6ac/packages/rolldown/src/options/output-options.ts#L266-L277
const sourceMapOutput = {
  sourcemapDebugIds: true,
  sourcemapExcludeSources: true,
} as const;

// A Node builtin reaching the browser graph resolves, by default, to a stub
// that throws on first property access, behind a warning a passing build
// scrolls away, and a route module that throws while it evaluates is one React
// Router answers with a reload loop. The edge arrives through a workspace
// barrel and is visible only in the module graph, so the client environment
// refuses to resolve a builtin at all and names the importer.
// https://github.com/remix-run/react-router/blob/2edaca7a4f12a50cad002d55d84f73b0cdd462b6/packages/react-router/lib/dom/ssr/routeModules.ts#L280-L308
const browserSafeGraph = (): Plugin => ({
  name: 'flowmock-browser-safe-graph',
  enforce: 'pre',
  applyToEnvironment: environment => environment.name === 'client',
  resolveId(source, importer) {
    if (!isBuiltin(source)) return;
    throw new Error(
      `${importer ?? '<entry>'} imports the Node builtin "${source}", which cannot run in a browser. `
      + 'Reach the module you need through a browser-safe export instead.',
    );
  },
});

export default defineConfig(({ command }) => ({
  build: legacyCssBuild,
  // React Router discovers route modules lazily. Pre-bundle their browser
  // dependencies at startup so the first visit to a route never makes Vite
  // re-optimize and reload the already-mounted app.
  optimizeDeps: {
    include: [
      '@fluentui/react-charts',
      '@fluentui/react-components',
      '@fluentui/react-icons',
      'd3-shape',
      'hono/client',
      'i18next',
      'monaco-editor',
      'monaco-yaml',
      'overlayscrollbars',
      'prismjs',
      'react',
      'react-dom/client',
      'react-i18next',
      'react-router',
    ],
    exclude: [...PRISM_COMPONENTS],
  },
  plugins: [
    browserSafeGraph(),
    prismComponentsEsm(),
    typescriptStylesheets(stylesheets),
    reactRouter(),
  ],
  // Fluent's ESM facade imports named exports from its provider packages,
  // whose node export condition points at CommonJS. Dev SSR must transform the
  // whole family together; externalizing the nested provider lets Node select
  // CommonJS and reject those named imports.
  // https://github.com/microsoft/fluentui/blob/4aa1084999a8c1ac7245724ad6c76210fe80acf6/packages/react-components/react-provider/package.json#L24-L30
  //
  // The build bundles the server graph whole. Its only job is prerendering
  // index.html, and an import it leaves external is resolved from dist/server,
  // where pnpm's strict layout holds none of Fluent's own dependencies
  // (scheduler, use-sync-external-store): Node then fails, or finds whatever an
  // ancestor directory happens to hold.
  ssr: {
    noExternal: command === 'build' ? true : [/^@fluentui\//, /^@griffel\//, /^tabster(?:$|\/)/],
  },
  server: {
    host: '127.0.0.1',
    port: webPort,
    proxy: Object.fromEntries(serverPaths.map(path => [path, { target: serverOrigin, changeOrigin: true, ws: true }])),
  },
  // The build prerenders the root route by standing up a preview server and
  // connecting to resolvedUrls.local[0]; pinning the IPv4 loopback makes the
  // bind address and that URL name the same interface on every host.
  // https://github.com/remix-run/react-router/blob/react-router%408.3.0/packages/react-router-dev/vite/plugins/prerender.ts#L546-L573
  preview: {
    host: '127.0.0.1',
  },
  // A ?worker import is bundled by its own rolldown pass, which the client
  // environment's output options do not reach.
  // https://github.com/vitejs/vite/blob/v8.1.5/packages/vite/src/node/plugins/worker.ts#L162-L232
  worker: {
    rolldownOptions: { output: sourceMapOutput },
  },
  environments: {
    client: {
      build: {
        ...legacyCssBuild,
        sourcemap: true,
        rolldownOptions: {
          output: {
            ...sourceMapOutput,
            codeSplitting: {
              groups: [
                // The charts stay out of the Fluent group so they and their d3
                // dependencies settle into a chunk only the chart routes pull
                // in, instead of riding the shell to every page.
                {
                  name: 'fluent',
                  test: /node_modules[\\/](?:\.pnpm[\\/])?(?:@fluentui\+(?!react-charts|chart-utilities)|@griffel\+|tabster@|@fluentui[\\/](?!react-charts|chart-utilities)|@griffel[\\/]|tabster[\\/])/,
                  priority: 30,
                },
                // Above the Fluent group, so a Fluent bump does not rehash React
                // and the other way round.
                {
                  name: 'react-runtime',
                  test: /node_modules[\\/](?:\.pnpm[\\/])?(?:react(?:-dom|-router)?@|scheduler@|react(?:-dom|-router)?[\\/]|scheduler[\\/])/,
                  priority: 40,
                },
              ],
            },
          },
        },
      },
    },
  },
}));
