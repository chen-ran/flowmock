import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import weakNetwork from '../../../../../examples/scenarios/weak-network-429.yaml?raw';
import * as editor from '../../../src/routes/scenario-editor.tsx';
import * as creator from '../../../src/routes/scenario-new.tsx';
import { useAuthStore } from '../../../src/stores/auth-store.ts';
import { renderInApp } from '../../render.tsx';
import { OutcomeToastProvider } from '@flowmock/ui/controls/outcome-toast.tsx';
import type { YamlMarker } from '@flowmock/ui/controls/yaml-editor.tsx';

// Monaco does not run in happy-dom; a textarea stands in for it, carrying the
// markers it was handed where a test can read them.
vi.mock('@flowmock/ui/controls/lazy-editors.ts', () => ({
  LazyYamlEditor: ({ label, markers, onChange, value }: { label: string; markers?: YamlMarker[]; onChange: (value: string) => void; value: string }) =>
    <textarea aria-label={label} data-markers={JSON.stringify(markers ?? [])} onChange={event => onChange(event.target.value)} value={value} />,
}));

let saved: Array<{ name: string; body: string }> = [];
let saveResponse: () => Response = () => Response.json({});

const fakeServer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(String(input), 'http://flowmock.test');
  const method = init?.method ?? 'GET';
  if (url.pathname === '/api/auth/me') return Response.json({ via: 'open' });
  if (url.pathname === '/api/recordings') return Response.json({ items: [], total: 0 });
  if (url.pathname === '/api/cassettes') return Response.json({ items: [] });
  if (url.pathname === '/api/schema/scenario') return Response.json({});
  const scenario = /^\/api\/scenarios\/([^/]+)$/.exec(url.pathname);
  if (scenario && method === 'PUT') {
    saved.push({ name: decodeURIComponent(scenario[1]!), body: String(init?.body) });
    return saveResponse();
  }
  if (scenario?.[1] === 'weak-network-429') {
    return Response.json({ name: 'weak-network-429', builtIn: false, source: weakNetwork, scenario: {}, createdAt: 0, updatedAt: 0 });
  }
  if (scenario) return Response.json({ error: { code: 'not_found', message: 'scenario not found' } }, { status: 404 });
  return new Response(null, { status: 404 });
};

const Shell = ({ children }: { children: ReactNode }) => <OutcomeToastProvider>{children}</OutcomeToastProvider>;

const renderEditor = (entry: string) => {
  const router = createMemoryRouter([
    { path: '/scenarios/new', loader: creator.clientLoader, element: <Shell><creator.default /></Shell> },
    { path: '/scenarios/:name', loader: editor.clientLoader, element: <Shell><editor.default /></Shell> },
    { path: '/scenarios', element: <p>scenario list</p> },
  ], { initialEntries: [entry] });
  renderInApp(<RouterProvider router={router} />);
  return router;
};

const yamlView = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: 'YAML' }));
  return await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'YAML' });
};

beforeEach(() => {
  saved = [];
  saveResponse = () => Response.json({});
  useAuthStore.getState().clear();
  vi.stubGlobal('fetch', vi.fn(fakeServer));
});
afterEach(() => vi.unstubAllGlobals());

describe('the scenario editor', () => {
  it('writes a form change into the YAML and keeps its comments', async () => {
    renderEditor('/scenarios/weak-network-429');
    const mean = await screen.findByRole('textbox', { name: 'Mean (tokens/s)' });
    fireEvent.change(mean, { target: { value: '75' } });
    const yaml = await yamlView();
    expect(yaml.value).toBe(weakNetwork.replace('tps: { dist: normal, mean: 60, sd: 10 }', 'tps: { dist: normal, mean: 75, sd: 10 }'));
  });

  it('shows a YAML change in the form', async () => {
    renderEditor('/scenarios/weak-network-429');
    const yaml = await yamlView();
    fireEvent.change(yaml, { target: { value: yaml.value.replace('latencyMs: 80', 'latencyMs: 120') } });
    fireEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect((await screen.findByRole<HTMLInputElement>('textbox', { name: 'Latency (ms)' })).value).toBe('120');
  });

  it('asks for the YAML to be fixed before the form can show it', async () => {
    renderEditor('/scenarios/weak-network-429');
    const yaml = await yamlView();
    fireEvent.change(yaml, { target: { value: 'timing: { mode: [' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Form' }));
    expect(await screen.findByText(/The YAML does not parse/)).toBeTruthy();
  });

  it('saves the YAML as written and marks the fields the server refuses', async () => {
    saveResponse = () => Response.json({ error: { code: 'invalid_request', message: 'invalid scenario', issues: [{ path: ['network', 'latencyMs'], message: 'Too small: expected number to be >=0' }] } }, { status: 400 });
    renderEditor('/scenarios/weak-network-429');
    const yaml = await yamlView();
    const edited = yaml.value.replace('latencyMs: 80', 'latencyMs: -1');
    fireEvent.change(yaml, { target: { value: edited } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toEqual([{ name: 'weak-network-429', body: edited }]));
    const alert = await screen.findByText('The scenario is not valid');
    expect(within(alert.closest('[role="group"], .fui-MessageBar') as HTMLElement).getByText('network.latencyMs')).toBeTruthy();
    const line = edited.split('\n').findIndex(text => text.includes('latencyMs: -1')) + 1;
    const markers = JSON.parse(screen.getByRole('textbox', { name: 'YAML' }).getAttribute('data-markers')!) as YamlMarker[];
    expect(markers).toEqual([{ line, column: 14, endLine: line, endColumn: 16, message: 'network.latencyMs: Too small: expected number to be >=0' }]);
  });

  it('drops the marks once the text they were found in changes', async () => {
    saveResponse = () => Response.json({ error: { code: 'invalid_request', message: 'scenario is not valid YAML', position: { line: 2, col: 3 } } }, { status: 400 });
    renderEditor('/scenarios/weak-network-429');
    const yaml = await yamlView();
    fireEvent.change(yaml, { target: { value: `${yaml.value}\n# edited` } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(JSON.parse(screen.getByRole('textbox', { name: 'YAML' }).getAttribute('data-markers')!)).toHaveLength(1));
    fireEvent.change(screen.getByRole('textbox', { name: 'YAML' }), { target: { value: `${yaml.value}\n# edited again` } });
    expect(JSON.parse(screen.getByRole('textbox', { name: 'YAML' }).getAttribute('data-markers')!)).toEqual([]);
  });

  it('creates a scenario from a handed-over draft and opens it under its name', async () => {
    const draft = 'name: checkout-sequence\nselection: { mode: sequence, cassette: cas_1 }\n';
    const router = renderEditor(`/scenarios/new?draft=${encodeURIComponent(draft)}`);
    expect((await screen.findByRole<HTMLInputElement>('textbox', { name: 'Name' })).value).toBe('checkout-sequence');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toEqual([{ name: 'checkout-sequence', body: draft }]));
    await waitFor(() => expect(router.state.location.pathname).toBe('/scenarios/checkout-sequence'));
  });

  it('holds a page change while edits are unsaved', async () => {
    const router = renderEditor('/scenarios/weak-network-429');
    fireEvent.change(await screen.findByRole('textbox', { name: 'Latency (ms)' }), { target: { value: '90' } });
    void router.navigate('/scenarios');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Leave without saving?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/scenarios'));
  });
});
