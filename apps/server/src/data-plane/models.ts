import type { Context } from 'hono';

import { extractKey } from './endpoints.ts';
import type { Services } from '../services.ts';

const authorized = (c: Context, services: Services): boolean => {
  const key = extractKey(c.req.raw.headers, new URL(c.req.url));
  return key !== null && services.config.getKey(key) !== null;
};

// `/v1/models` serves both OpenAI and Anthropic clients; the Anthropic SDK
// always sends `anthropic-version`.
// https://docs.anthropic.com/en/api/models-list
// https://platform.openai.com/docs/api-reference/models/list
export const listModels = (c: Context, services: Services): Response => {
  if (!authorized(c, services)) {
    return c.json({ error: { message: 'FlowMock: this API key is not bound to a record target or replay scenario.', type: 'authentication_error', code: 'invalid_api_key' } }, 401);
  }
  const anthropic = c.req.header('anthropic-version') !== undefined;
  const models = services.corpus.models()
    .filter(model => (anthropic ? model.protocol === 'anthropic-messages' : model.protocol !== 'gemini-generate-content'));
  const unique = [...new Map(models.map(model => [model.model, model])).values()];
  if (anthropic) {
    return c.json({
      data: unique.map(model => ({ type: 'model', id: model.model, display_name: model.model, created_at: new Date(model.createdAt).toISOString() })),
      has_more: false,
      first_id: unique[0]?.model ?? null,
      last_id: unique.at(-1)?.model ?? null,
    });
  }
  return c.json({ object: 'list', data: unique.map(model => ({ id: model.model, object: 'model', created: Math.floor(model.createdAt / 1000), owned_by: 'flowmock' })) });
};

const geminiModel = (model: string) => ({
  name: `models/${model}`,
  displayName: model,
  supportedGenerationMethods: ['generateContent', 'streamGenerateContent', 'countTokens'],
});

// https://ai.google.dev/api/models#method:-models.list
export const listGeminiModels = (c: Context, services: Services): Response => {
  if (!authorized(c, services)) return c.json({ error: { code: 401, message: 'FlowMock: unknown API key.', status: 'UNAUTHENTICATED' } }, 401);
  const models = [...new Set(services.corpus.models().filter(model => model.protocol === 'gemini-generate-content').map(model => model.model))];
  return c.json({ models: models.map(geminiModel) });
};

export const getGeminiModel = (c: Context, services: Services, model: string): Response => {
  if (!authorized(c, services)) return c.json({ error: { code: 401, message: 'FlowMock: unknown API key.', status: 'UNAUTHENTICATED' } }, 401);
  const known = services.corpus.models().some(entry => entry.protocol === 'gemini-generate-content' && entry.model === model);
  return known ? c.json(geminiModel(model)) : c.json({ error: { code: 404, message: `models/${model} is not found.`, status: 'NOT_FOUND' } }, 404);
};
