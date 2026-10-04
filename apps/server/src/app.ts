import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';

import { adminAuth, controlRoutes } from './control/routes.ts';
import { matchEndpoint } from './data-plane/endpoints.ts';
import { handleDataPlane } from './data-plane/http.ts';
import { getGeminiModel, listGeminiModels, listModels } from './data-plane/models.ts';
import type { Services } from './services.ts';

export const createApp = (services: Services) => {
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.onError((error, c) => c.json({ error: { type: 'flowmock_internal_error', message: error.message, stack: error.stack } }, 500));

  const control = controlRoutes(services);
  app.route('/api', control);
  app.get('/metrics', adminAuth(services), c => c.text(services.metrics.render(), 200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' }));

  app.get('/v1/models', c => listModels(c, services));
  app.get('/models', c => listModels(c, services));
  app.get('/v1beta/models', c => listGeminiModels(c, services));
  app.get('/v1beta/models/:model', c => getGeminiModel(c, services, c.req.param('model')));

  // Every generation endpoint of the four protocols, record or replay
  // depending on the key the client presents.
  app.post('*', async (c, next) => {
    const url = new URL(c.req.url);
    const endpoint = matchEndpoint(url.pathname, url.search);
    if (!endpoint) {
      await next();
      return;
    }
    return await handleDataPlane(c, services, endpoint);
  });

  app.notFound(c => c.json({ error: { type: 'not_found_error', message: `FlowMock does not serve ${c.req.method} ${new URL(c.req.url).pathname}.` } }, 404));

  return { app, control };
};

export type ControlApp = ReturnType<typeof controlRoutes>;
