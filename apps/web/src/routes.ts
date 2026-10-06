import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  route('login', 'routes/login.tsx'),
  layout('routes/dashboard.tsx', [
    index('routes/index.tsx'),
  ]),
] satisfies RouteConfig;
