import type { Context, MiddlewareHandler, TypedResponse } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';

import type { AdminEnv } from './auth.ts';
import { ConfigError } from '../store/config-store.ts';

// Declare both the caller's JSON shape and the parsed shape (with defaults)
// at the Hono boundary so hc can infer inputs as well as outputs.
type InvalidBody = TypedResponse<{ error: { code: string; message: string } }, 400, 'json'>;
type JsonValidation<S extends z.ZodType> = (value: z.input<S>, c: Context<AdminEnv>) => z.output<S> | InvalidBody;

export const jsonBody = <S extends z.ZodType>(schema: S) => validator<z.input<S>, string, string, 'json', string, JsonValidation<S>>('json', (value, c) => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return c.json({ error: { code: 'invalid_request', message: z.prettifyError(parsed.error) } }, 400);
  return parsed.data as z.output<S>;
});

export const queryParams = <S extends z.ZodObject>(schema: S): MiddlewareHandler<AdminEnv, string, { in: { query: z.input<S> }; out: { query: z.output<S> } }, InvalidBody> => async (c, next) => {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: { code: 'invalid_request', message: z.prettifyError(parsed.error) } }, 400);
  c.req.addValidatedData('query', parsed.data);
  await next();
};

export const configErrorResponse = (c: Context<AdminEnv>, error: unknown) => {
  if (!(error instanceof ConfigError)) throw error;
  return c.json({ error: { code: 'invalid_request', message: error.message } }, error.status);
};
