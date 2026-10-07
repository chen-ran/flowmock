// Ported in part from Floway apps/web/src/routes.ts (MIT). See NOTICE.md.
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

// The WinUI gallery renders every Fluent control the app uses, so the WinUI
// layer can be judged in one place. It is scaffolding, not a product surface:
// no navigation entry and English placeholder copy. This table is its only
// importer, so gating it here keeps the module out of a shipped bundle, which
// scripts/check-gallery-dev-only.ts asserts against the build output.
//
// MODE and not DEV: this file runs in the server @react-router/dev starts to
// read the route table, which takes the outer command's mode but the loader
// process's NODE_ENV, and Vite derives DEV from NODE_ENV alone.
// https://github.com/vitejs/vite/blob/v8.1.5/packages/vite/src/node/config.ts#L2007-L2013
const developmentRoutes = import.meta.env.MODE === 'development'
  ? [route('winui-gallery', 'routes/winui-gallery.tsx')]
  : [];

export default [
  route('login', 'routes/login.tsx'),
  layout('routes/dashboard.tsx', [
    index('routes/index.tsx'),
    route('corpus', 'routes/corpus.tsx'),
    route('corpus/:id', 'routes/corpus-detail.tsx'),
    route('cassettes', 'routes/cassettes.tsx'),
    route('cassettes/:id', 'routes/cassette-detail.tsx'),
    route('scenarios', 'routes/scenarios.tsx'),
    route('scenarios/new', 'routes/scenario-new.tsx'),
    route('scenarios/:name', 'routes/scenario-editor.tsx'),
    route('keys', 'routes/keys.tsx'),
    route('monitor', 'routes/monitor.tsx'),
    route('requests', 'routes/requests.tsx'),
    route('requests/:id', 'routes/request-detail.tsx'),
    route('settings', 'routes/settings.tsx'),
    ...developmentRoutes,
  ]),
] satisfies RouteConfig;
