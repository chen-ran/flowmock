import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startTestServer, type TestServer } from '../support/flowmock.ts';
import { seedFixture } from '../support/seed.ts';
import { anthropicText } from '@flowmock/test-fixtures';

let flowmock: TestServer;
beforeEach(async () => {
  flowmock = await startTestServer();
  await seedFixture(flowmock.services, anthropicText);
});
afterEach(async () => { await flowmock.stop(); });

const DRAFT = `# A draft nobody saved yet.
name: draft
timing: { mode: synthetic, ttftMs: { dist: fixed, value: 400 }, tps: { dist: fixed, value: 50 } }
faults:
  - when: { callIndex: 3 }
    inject: { type: http_error, status: 529 }
`;

const preview = async (name: string, extra: Record<string, unknown>) => await flowmock.admin(`/scenarios/${name}/preview`, {
  method: 'POST',
  body: JSON.stringify({ protocol: 'anthropic-messages', body: anthropicText.request.body, seed: 'fixed', ...extra }),
});

type ErrorBody = { error: { message: string; issues?: Array<{ path: Array<string | number>; message: string }>; position?: { line: number; col: number } } };

describe('scenario previews', () => {
  it('plans an unsaved scenario exactly as the same scenario once saved', async () => {
    for (const callIndex of [1, 3]) {
      const unsaved = await preview('draft', { source: DRAFT, callIndex });
      expect(unsaved.status).toBe(200);
      const fromSource = await unsaved.json();
      expect((await flowmock.admin('/scenarios/draft', { method: 'PUT', body: DRAFT })).status).toBe(200);
      const fromStore = await (await preview('draft', { callIndex })).json();
      expect(fromSource).toEqual(fromStore);
      expect((await flowmock.admin('/scenarios/draft', { method: 'DELETE' })).status).toBe(204);
    }
  });

  it('points at the field an invalid draft gets wrong', async () => {
    const response = await preview('draft', { source: 'name: draft\ntiming: { mode: synthetic }\n', callIndex: 1 });
    expect(response.status).toBe(400);
    const { error } = await response.json() as ErrorBody;
    expect(error.issues?.map(issue => issue.path)).toContainEqual(['timing', 'ttftMs']);
  });

  it('points at the line and column of a draft that is not YAML', async () => {
    const response = await preview('draft', { source: 'name: draft\ntiming: { mode: [\n', callIndex: 1 });
    expect(response.status).toBe(400);
    const { error } = await response.json() as ErrorBody;
    expect(error.position).toMatchObject({ line: expect.any(Number), col: expect.any(Number) });
    expect(error.position!.line).toBeGreaterThanOrEqual(2);
  });

  it('still needs a saved scenario when given no source', async () => {
    expect((await preview('nowhere', { callIndex: 1 })).status).toBe(404);
  });
});

describe('saving a scenario', () => {
  it('reports each invalid field with its path', async () => {
    const response = await flowmock.admin('/scenarios/broken', { method: 'PUT', body: 'name: broken\nnetwork: { latencyMs: -5 }\n' });
    expect(response.status).toBe(400);
    const { error } = await response.json() as ErrorBody;
    expect(error.issues?.map(issue => issue.path)).toContainEqual(['network', 'latencyMs']);
  });
});
