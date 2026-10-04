import { describe, expect, it } from 'vitest';

import { adapterFor, applyRewrite, createRng, draftFromRecording, rewriteId, rewriteSchema, type ReplayDraft } from '../../src/index.ts';
import { fixtureRecording } from '../support/fixtures.ts';
import { anthropicToolUseThinking, chatText, responsesFunctionCall } from '@flowmock/test-fixtures';

const draftFor = async (fixture: typeof chatText, wire: 'sse' | 'ws' = 'sse', fidelity: 'normal' | 'raw' = 'normal'): Promise<ReplayDraft> =>
  await draftFromRecording(fixtureRecording(fixture), { protocol: fixture.protocol, transport: wire === 'ws' ? 'ws' : 'http', wire, stream: true, fidelity }, adapterFor(fixture.protocol));

const context = (fixture: typeof chatText, requestModel: string | null = null) => ({ adapter: adapterFor(fixture.protocol), rng: createRng('rewrite'), requestModel, nowSeconds: 1_800_000_000 });

describe('rewriteId', () => {
  it('keeps the prefix, length and alphabet of each identifier', () => {
    const rng = createRng('ids');
    for (const id of ['msg_01XFDUDYJgAACzvnptvVoYEL', 'chatcmpl-AbCdEf0123456789GhIjKlMnOpQr', 'resp_68e0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2', 'call_DdmO9pD3xa9XTPNJ32zg2hcA']) {
      const next = rewriteId(id, rng);
      expect(next).not.toBe(id);
      expect(next).toHaveLength(id.length);
      expect(next.slice(0, id.indexOf(id.includes('_') ? '_' : '-') + 1)).toBe(id.slice(0, id.indexOf(id.includes('_') ? '_' : '-') + 1));
    }
    expect(rewriteId('resp_68e0a1b2', rng)).toMatch(/^resp_[0-9a-f]{8}$/);
  });
});

describe('applyRewrite', () => {
  it('rewrites every occurrence of a response id consistently', async () => {
    const draft = await draftFor(chatText);
    applyRewrite(draft, rewriteSchema.parse({}), context(chatText));
    const ids = new Set(draft.frames.flatMap(frame => (frame.json && typeof frame.json === 'object' && 'id' in frame.json ? [(frame.json as { id: string }).id] : [])));
    expect(ids.size).toBe(1);
    expect([...ids][0]).not.toBe('chatcmpl-AbCdEf0123456789GhIjKlMnOpQr');
    expect(draft.frames.every(frame => !frame.raw.includes('chatcmpl-AbCdEf0123456789GhIjKlMnOpQr'))).toBe(true);
    expect(draft.frames.filter(frame => frame.origin === 'rewritten').length).toBeGreaterThan(0);
  });

  it('rewrites Responses item and call ids in every event that carries them', async () => {
    const draft = await draftFor(responsesFunctionCall);
    applyRewrite(draft, rewriteSchema.parse({}), context(responsesFunctionCall));
    const body = draft.frames.map(frame => frame.raw).join('');
    for (const old of ['resp_68e0f00dfacecafe0123456789abcdef0123456789abcdef', 'fc_68e0f00dfacecafe0123456789abcdef0123456789abcde1', 'call_Q3x9mVb2LkPq8RtZ1wYc4Hn6']) expect(body).not.toContain(old);
    const newCall = draft.idMap.get('call_Q3x9mVb2LkPq8RtZ1wYc4Hn6')!;
    // output_item.added, output_item.done and the completed response.
    expect(body.split(newCall).length - 1).toBe(3);
  });

  it('rewrites the model only when the client asked for a different one', async () => {
    const same = await draftFor(anthropicToolUseThinking);
    applyRewrite(same, rewriteSchema.parse({}), context(anthropicToolUseThinking, 'claude-sonnet-4-5'));
    expect(same.frames[0].raw).toContain('"model":"claude-sonnet-4-5-20250929"');

    const other = await draftFor(anthropicToolUseThinking);
    applyRewrite(other, rewriteSchema.parse({}), context(anthropicToolUseThinking, 'claude-opus-4-1'));
    expect(other.frames[0].raw).toContain('"model":"claude-opus-4-1"');
    expect(other.frames[0].json).toMatchObject({ message: { model: 'claude-opus-4-1' } });
  });

  it('shifts created timestamps to now', async () => {
    const draft = await draftFor(chatText);
    applyRewrite(draft, rewriteSchema.parse({}), context(chatText));
    expect(draft.frames[0].json).toMatchObject({ created: 1_800_000_000 });
  });

  it('keeps unrewritten frames byte-identical to the recording', async () => {
    const draft = await draftFor(anthropicToolUseThinking);
    applyRewrite(draft, rewriteSchema.parse({}), context(anthropicToolUseThinking, 'claude-sonnet-4-5'));
    const ping = draft.frames.find(frame => frame.sseEvent === 'content_block_delta');
    expect(ping?.origin).toBe('recorded');
    expect(ping?.raw).toMatch(/^event: content_block_delta\ndata: /);
  });

  it('leaves raw fidelity untouched', async () => {
    const draft = await draftFor(chatText, 'sse', 'raw');
    applyRewrite(draft, rewriteSchema.parse({}), context(chatText));
    expect(draft.idMap.size).toBe(0);
    expect(draft.provenance.at(-1)?.detail).toMatch(/raw fidelity/);
  });
});
