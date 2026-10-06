import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

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
    route('settings', 'routes/settings.tsx'),
  ]),
] satisfies RouteConfig;
