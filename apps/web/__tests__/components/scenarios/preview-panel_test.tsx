import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import weakNetwork from '../../../../../examples/scenarios/weak-network-429.yaml?raw';
import type { ScenarioPreview } from '../../../src/api/types.ts';
import { PreviewPanel } from '../../../src/components/scenarios/preview-panel.tsx';
import { renderInApp } from '../../render.tsx';

type PreviewBody = { source: string; protocol: string; path: string; callIndex: number; seed?: string; session?: string };

let previews: PreviewBody[] = [];

const plan = (status: number): ScenarioPreview['plan'] => ({
  transport: 'http',
  status,
  headers: [],
  headersAt: 80,
  end: { mode: 'complete', at: status === 429 ? 90 : 900 },
  expected: { ttftMs: status === 429 ? null : 812, tps: status === 429 ? null : 60, durationMs: status === 429 ? 90 : 900 },
  outputTokens: status === 429 ? 0 : 12,
  writes: status === 429
    ? [{ at: 90, frame: 0, content: false, bytes: 120, text: '{"type":"error"}' }]
    : [{ at: 100, frame: 0, content: false, bytes: 40, text: 'event: message_start' }, { at: 812, frame: 1, content: true, bytes: 60, text: 'event: content_block_delta' }],
});

const trace = (callIndex: number): ScenarioPreview['trace'] => ({
  scenario: 'weak-network-429',
  seed: 'seed-1',
  sessionId: 'ses_1',
  callIndex,
  fingerprint: 'fp',
  selection: { mode: 'sample', candidates: 3, score: 0.5 },
  misses: [],
  recordingId: 'rec_1',
  fault: callIndex === 3 ? { rule: 0, type: 'http_error' } : null,
  provenance: callIndex === 3 ? [] : [{ transform: 'rewrite', detail: 'model claude → claude-sonnet' }],
  frames: [],
  error: null,
});

const fakeServer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input), 'http://flowmock.test');
  if (url.pathname.endsWith('/preview')) {
    const body = JSON.parse(String(init?.body)) as PreviewBody;
    previews.push(body);
    if (body.source.includes('latencyMs: -1')) {
      return Response.json({ error: { code: 'invalid_request', message: 'invalid scenario', issues: [{ path: ['network', 'latencyMs'], message: 'Too small' }] } }, { status: 400 });
    }
    return Response.json({ plan: plan(body.callIndex === 3 ? 429 : 200), trace: trace(body.callIndex) });
  }
  return new Response(null, { status: 404 });
};

beforeEach(() => {
  previews = [];
  vi.stubGlobal('fetch', vi.fn(fakeServer));
});
afterEach(() => vi.unstubAllGlobals());

const renderPanel = (source: string, onProblems = vi.fn()) => {
  renderInApp(<MemoryRouter><PreviewPanel name="weak-network-429" onProblems={onProblems} recordings={[]} source={source} /></MemoryRouter>);
  return onProblems;
};

describe('the preview panel', () => {
  it('previews the unsaved source against a pasted request', async () => {
    renderPanel(weakNetwork);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('rec_1')).toBeTruthy();
    expect(previews).toEqual([expect.objectContaining({ source: weakNetwork, protocol: 'anthropic-messages', path: '/v1/messages', callIndex: 1 })]);
    expect(previews[0]).not.toHaveProperty('seed');
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('Sampled from 3 candidates (score 0.50)')).toBeTruthy();
    expect(screen.getByText('model claude → claude-sonnet')).toBeTruthy();
  });

  it('shows the third call refused by the rule that fired', async () => {
    renderPanel(weakNetwork);
    const call = screen.getByRole('spinbutton', { name: 'Call' });
    fireEvent.change(call, { target: { value: '3' } });
    fireEvent.keyDown(call, { key: 'Enter' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Seed' }), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('429')).toBeTruthy();
    expect(screen.getByText('Rule 1: HTTP error')).toBeTruthy();
    expect(previews.at(-1)).toEqual(expect.objectContaining({ callIndex: 3, seed: '42' }));
  });

  it('hands the server\'s placed problems to the editor', async () => {
    const onProblems = renderPanel(weakNetwork.replace('latencyMs: 80', 'latencyMs: -1'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(onProblems).toHaveBeenLastCalledWith({ message: 'invalid scenario', issues: [{ path: ['network', 'latencyMs'], message: 'Too small' }], position: null }));
    expect(screen.getByText('The preview failed')).toBeTruthy();
  });

  it('refuses a pasted body that is not JSON', async () => {
    renderPanel(weakNetwork);
    fireEvent.change(screen.getByRole('textbox', { name: 'Body (JSON)' }), { target: { value: '{ nope' } });
    expect(await screen.findByText('The body is not JSON.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(previews).toEqual([]);
  });
});
