import { timingSafeEqual } from 'node:crypto';

import type { HttpBindings } from '@hono/node-server';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';

import { jsonBody } from './validation.ts';
import type { Services } from '../services.ts';

export type AdminEnv = { Bindings: HttpBindings; Variables: { adminVia: 'session' | 'admin-key' | 'open'; adminToken: string | null } };

const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const adminAuth = (services: Services): MiddlewareHandler<AdminEnv> => async (c, next) => {
  const bearer = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '')?.[1]?.trim();
  const queryAllowed = c.req.method === 'GET' && ['/api/live', '/api/requests/stream'].includes(c.req.path);
  const token = c.req.header('x-flowmock-admin-session') ?? (queryAllowed ? c.req.query('session') : undefined);
  c.set('adminToken', null);
  if (services.adminKey !== null && bearer !== undefined && safeEqual(bearer, services.adminKey)) {
    c.set('adminVia', 'admin-key');
  } else if (token !== undefined && services.adminSessions.verify(token) !== null) {
    c.set('adminVia', 'session');
    c.set('adminToken', token);
  } else if (services.adminKey === null && token === undefined && bearer === undefined) {
    c.set('adminVia', 'open');
  } else {
    return c.json({ error: { code: 'unauthorized', message: 'FlowMock admin API: send a valid admin key or admin session.' } }, 401);
  }
  await next();
};

const loginSchema = z.object({ key: z.string().min(1) }).strict();

export const authRoutes = (services: Services) => {
  const failures = new Map<string, { count: number; at: number }>();
  return new Hono<AdminEnv>()
    .post('/login', jsonBody(loginSchema), c => {
      const body = c.req.valid('json');
      const now = Date.now();
      // Use the socket address, never an untrusted forwarding header.
      const address = c.env.incoming?.socket.remoteAddress ?? 'local';
      for (const [id, bucket] of failures) if (now - bucket.at >= 60_000) failures.delete(id);
      if (services.adminKey !== null && !safeEqual(body.key, services.adminKey)) {
        const bucket = failures.get(address) ?? { count: 0, at: now };
        failures.set(address, bucket);
        if (bucket.count >= 10) return c.json({ error: { code: 'rate_limited', message: 'Too many login failures; retry after one minute.' } }, 429, { 'retry-after': String(Math.ceil((60_000 - (now - bucket.at)) / 1000)) });
        bucket.count++;
        return c.json({ error: { code: 'unauthorized', message: 'Invalid admin key.' } }, 401);
      }
      failures.delete(address);
      services.adminSessions.purgeExpired(now);
      return c.json(services.adminSessions.create(now), 201);
    })
    .get('/me', adminAuth(services), c => c.json({ via: c.get('adminVia') }, 200))
    .delete('/session', adminAuth(services), c => {
      const token = c.get('adminToken');
      if (token !== null) services.adminSessions.revoke(token);
      return c.body(null, 204);
    });
};
