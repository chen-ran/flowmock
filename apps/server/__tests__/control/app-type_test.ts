import { hc, type InferRequestType } from 'hono/client';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';

import type { KeyInput } from '../../src/store/config-store.ts';
import { ADMIN_KEY, startTestServer, type TestServer } from '../support/flowmock.ts';
import { seedFixture } from '../support/seed.ts';
import type { AppType } from '@flowmock/server/app-type';
import { anthropicText } from '@flowmock/test-fixtures';

let flowmock: TestServer;
beforeAll(async () => { flowmock = await startTestServer(); await seedFixture(flowmock.services, anthropicText); });
afterAll(async () => { await flowmock.stop(); });

describe('typed control-plane client', () => {
  it('infers scenario responses, JSON inputs, previews and created keys', async () => {
    const client = hc<AppType>(`${flowmock.url}/api`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
    const list = await (await client.scenarios.$get()).json();
    expectTypeOf(list.items[0].name).toEqualTypeOf<string>();
    expect(list.items[0].name).toBe('default');
    const searched = await client.recordings.$get({ query: { q: 'hello', limit: '10' } });
    expect(searched.status).toBe(200);
    expectTypeOf<InferRequestType<typeof client.keys.$post>['json']>().toEqualTypeOf<KeyInput>();
    const key = await client.keys.$post({ json: { key: 'fm-typed-client', replay: 'default' } });
    expect(key.status).toBe(201);
    if (key.status === 201) {
      const created = await key.json();
      expectTypeOf(created.key).toEqualTypeOf<string>();
      expect(created.scenario).toBe('default');
    }
    const preview = await client.scenarios[':name'].preview.$post({ param: { name: 'default' }, json: { protocol: 'anthropic-messages', body: anthropicText.request.body } });
    expect(preview.status).toBe(200);
    if (preview.status === 200) {
      const data = await preview.json();
      expectTypeOf(data.plan.writes[0].at).toEqualTypeOf<number>();
      expect(data.plan.writes.length).toBeGreaterThan(0);
    }
  });

  it('exposes typed validation and missing-reference errors', async () => {
    const client = hc<AppType>(`${flowmock.url}/api`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
    const response = await client.keys.$post({ json: { key: 'fm-typed-missing', replay: 'missing' } });
    expect(response.status).toBe(404);
    if (response.status === 404) {
      const body = await response.json();
      expectTypeOf(body.error.message).toEqualTypeOf<string>();
      expect(body.error.code).toBe('invalid_request');
    }
    expect((await fetch(`${flowmock.url}/api/keys`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' }, body: 'broken JSON' })).status).toBe(400);
  });
});
