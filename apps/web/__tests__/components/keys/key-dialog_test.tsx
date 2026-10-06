import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyDialog } from '../../../src/components/keys/key-dialog.tsx';
import { isHttpUrl, TargetDialog } from '../../../src/components/keys/target-dialog.tsx';
import { renderInApp } from '../../render.tsx';

let posted: Array<{ path: string; body: unknown }> = [];
beforeEach(() => {
  posted = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    posted.push({ path: new URL(String(input), 'http://flowmock.test').pathname, body: JSON.parse(String(init?.body)) });
    return Response.json({}, { status: 201 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const target = { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', headers: { 'x-api-key': 'sk-a••••6789' }, createdAt: 0, updatedAt: 0 };
const scenario = { name: 'default', builtIn: true, source: 'name: default', scenario: {} as never, createdAt: 0, updatedAt: 0 };

describe('the key dialog', () => {
  it('binds a key to a scenario by default and to a target when recording', async () => {
    const saved = vi.fn();
    renderInApp(<KeyDialog binding={null} onOpenChange={() => {}} onSaved={saved} open scenarios={[scenario]} targets={[target]} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Key' }), { target: { value: 'fm-test-0001' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('fm-test-0001'));
    expect(posted).toEqual([{ path: '/api/keys', body: { key: 'fm-test-0001', record: 'anthropic' } }]);
  });

  it('refuses a key shorter than the server accepts', async () => {
    renderInApp(<KeyDialog binding={null} onOpenChange={() => {}} onSaved={() => {}} open scenarios={[scenario]} targets={[]} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Key' }), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A key needs at least 8 characters.')).toBeTruthy();
    expect(posted).toEqual([]);
  });
});

describe('the target dialog', () => {
  it('takes only an http or https base URL', () => {
    expect(isHttpUrl('https://api.anthropic.com')).toBe(true);
    expect(isHttpUrl('http://127.0.0.1:9000/proxy')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('api.anthropic.com')).toBe(false);
  });

  it('reports a base URL it cannot forward to', async () => {
    renderInApp(<TargetDialog onOpenChange={() => {}} onSaved={() => {}} open target={null} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'ID' }), { target: { value: 'local' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Base URL' }), { target: { value: 'file:///etc/hosts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter an http or https URL.')).toBeTruthy();
    expect(posted).toEqual([]);
  });

  it('keeps a saved secret the edit leaves empty', async () => {
    const saved = vi.fn();
    renderInApp(<TargetDialog onOpenChange={() => {}} onSaved={saved} open target={target} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Base URL' }), { target: { value: 'https://proxy.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(posted).toEqual([{ path: '/api/targets', body: { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://proxy.example.com', headers: { 'x-api-key': null } } }]);
  });
});
