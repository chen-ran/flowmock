import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { stringify } from 'yaml';

import { type FakeUpstream, startFakeUpstream } from './support/fake-upstream.ts';
import { startTestServer, type TestServer } from './support/flowmock.ts';
import { responsesFunctionCall, responsesText } from '@flowmock/test-fixtures';

let flowmock: TestServer;
let upstream: FakeUpstream;

interface Turn {
  events: Array<Record<string, unknown> & { type: string }>;
  response: { id: string; output: Array<Record<string, unknown>> };
}

const connect = async (key: string): Promise<WebSocket> => {
  const socket = new WebSocket(`${flowmock.url.replace('http', 'ws')}/v1/responses`, { headers: { authorization: `Bearer ${key}` } });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return socket;
};

const turn = async (socket: WebSocket, body: Record<string, unknown>): Promise<Turn> => {
  const events: Turn['events'] = [];
  return await new Promise<Turn>((resolve, reject) => {
    const onMessage = (data: Buffer) => {
      const event = JSON.parse(data.toString()) as Turn['events'][number];
      events.push(event);
      if (event.type === 'error') {
        socket.off('message', onMessage);
        reject(new Error(JSON.stringify(event)));
      }
      if (event.type === 'response.completed') {
        socket.off('message', onMessage);
        resolve({ events, response: event.response as Turn['response'] });
      }
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ type: 'response.create', ...body }));
  });
};

const FIRST_TURN = {
  model: 'gpt-5-mini',
  store: false,
  reasoning: { effort: 'medium', summary: 'auto' },
  tools: (responsesFunctionCall.request.body as { tools: unknown[] }).tools,
  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Weather in Paris?' }] }],
};

const secondTurn = (first: Turn) => {
  const call = first.response.output.find(item => item.type === 'function_call')!;
  return {
    model: 'gpt-5-mini',
    store: false,
    previous_response_id: first.response.id,
    tools: FIRST_TURN.tools,
    input: [{ type: 'function_call_output', call_id: call.call_id, output: '18°C, sunny' }],
  };
};

beforeAll(async () => {
  upstream = await startFakeUpstream();
  upstream.respondWith(request => ((JSON.parse(request.body) as { previous_response_id?: string }).previous_response_id ? responsesText : responsesFunctionCall));
  flowmock = await startTestServer();
  flowmock.services.config.upsertTarget({ id: 'openai', baseUrl: upstream.url, headers: { authorization: 'Bearer sk-upstream' } });
  flowmock.services.config.upsertKey({ key: 'fm-ws-record', record: 'openai' });
  flowmock.services.config.upsertScenario(stringify({ name: 'strict-match', selection: { mode: 'match' }, timing: { mode: 'recorded', scale: 0.05 } }));
  flowmock.services.config.upsertKey({ key: 'fm-ws-replay', replay: 'strict-match' });
});

afterAll(async () => {
  await flowmock.stop();
  await upstream.close();
});

describe('Responses over WebSocket', () => {
  it('records a two-turn conversation through the proxy', async () => {
    const socket = await connect('fm-ws-record');
    const first = await turn(socket, FIRST_TURN);
    expect(first.response.id).toBe('resp_68e0f00dfacecafe0123456789abcdef0123456789abcdef');
    const second = await turn(socket, secondTurn(first));
    expect(second.events.at(-1)?.type).toBe('response.completed');
    socket.close();

    expect(upstream.requests.at(-1)?.headers.authorization).toBe('Bearer sk-upstream');
    const recordings = await (await flowmock.admin('/recordings?protocol=openai-responses')).json() as { items: Array<{ transport: string; features: { outcome: string }; cassetteSeq: number }> };
    expect(recordings.items.map(item => [item.transport, item.features.outcome, item.cassetteSeq]).sort()).toEqual([['ws', 'ok', 1], ['ws', 'ok', 2]]);
  });

  it('replays both turns on one connection, continuing by previous_response_id', async () => {
    const socket = await connect('fm-ws-replay');
    const first = await turn(socket, FIRST_TURN);
    expect(first.response.id).not.toBe('resp_68e0f00dfacecafe0123456789abcdef0123456789abcdef');
    expect(first.events.map(event => event.type)).toContain('response.function_call_arguments.delta');
    const second = await turn(socket, secondTurn(first));
    expect(second.response.output.find(item => item.type === 'message')).toMatchObject({ content: [{ text: 'Hi there! What can I do for you?' }] });
    socket.close();

    const timeline = await (await flowmock.admin('/requests?mode=replay')).json() as { items: Array<{ transport: string; trace: { selection: { mode: string } } }> };
    expect(timeline.items.slice(0, 2).map(item => [item.transport, item.trace.selection.mode])).toEqual([['ws', 'exact'], ['ws', 'exact']]);
  });

  it('closes the socket with the configured code', async () => {
    flowmock.services.config.upsertScenario(stringify({ name: 'ws-close', faults: [{ inject: { type: 'interrupt', at: { frame: 3 }, mode: 'ws_close', code: 1013, reason: 'try again later' } }] }));
    flowmock.services.config.upsertKey({ key: 'fm-ws-close', replay: 'ws-close' });
    const socket = await connect('fm-ws-close');
    const received: string[] = [];
    socket.on('message', data => received.push(data.toString()));
    const closed = new Promise<{ code: number; reason: string }>(resolve => socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
    socket.send(JSON.stringify({ type: 'response.create', ...FIRST_TURN }));
    expect(await closed).toEqual({ code: 1013, reason: 'try again later' });
    expect(received).toHaveLength(3);
  });

  it('rejects an unknown key at the upgrade', async () => {
    const socket = new WebSocket(`${flowmock.url.replace('http', 'ws')}/v1/responses`, { headers: { authorization: 'Bearer fm-nobody' } });
    const status = await new Promise<number>(resolve => socket.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0)));
    expect(status).toBe(401);
  });

  it('answers a malformed message with an error event and keeps the socket open', async () => {
    const socket = await connect('fm-ws-replay');
    const error = await new Promise<Record<string, unknown>>(resolve => {
      socket.once('message', data => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
      socket.send('not json');
    });
    expect(error).toMatchObject({ type: 'error', status: 400 });
    const first = await turn(socket, FIRST_TURN);
    expect(first.events.at(-1)?.type).toBe('response.completed');
    socket.close();
  });
});
