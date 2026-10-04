// @vitest-environment node
import { fileURLToPath } from 'node:url';

import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, it } from 'vitest';

import { criticalCss } from '../../src/critical.css.ts';
import { FLOWMOCK_STYLESHEETS, typescriptStylesheets } from '../../src/vite/typescript-stylesheets.ts';
import { winuiCss } from '../../src/winui/index.ts';

type Hook<Name extends 'resolveId' | 'load' | 'configureServer'> = Extract<NonNullable<Plugin[Name]>, (...args: never[]) => unknown>;

const loadIn = async (plugin: Plugin, mode: 'build' | 'dev', id: string) => {
  const watched: string[] = [];
  const context = { addWatchFile: (file: string) => { watched.push(file); }, environment: { mode } };
  const result = await (plugin.load as Hook<'load'>).call(context as never, id, {} as never);
  return { result, watched };
};

describe('typescriptStylesheets', () => {
  it('claims only the virtual sheets it was given, keeping the query', () => {
    const resolveId = typescriptStylesheets(FLOWMOCK_STYLESHEETS).resolveId as Hook<'resolveId'>;
    const resolve = (id: string) => resolveId.call({} as never, id, undefined, {} as never);

    expect(resolve('virtual:flowmock-winui.css?url')).toBe('\0virtual:flowmock-winui.css?url');
    expect(resolve('\0virtual:flowmock-critical.css?inline')).toBe('\0virtual:flowmock-critical.css?inline');
    expect(resolve('virtual:other.css')).toBeUndefined();
  });

  it('renders the exported stylesheet and watches the graph it read', async () => {
    const plugin = typescriptStylesheets(FLOWMOCK_STYLESHEETS);

    const winui = await loadIn(plugin, 'build', '\0virtual:flowmock-winui.css?url');
    expect(winui.result).toBe(winuiCss);
    expect(winui.watched).toContain(fileURLToPath(new URL('../../src/winui/index.ts', import.meta.url)));
    expect(winui.watched).toContain(fileURLToPath(new URL('../../src/winui/tokens.ts', import.meta.url)));

    expect((await loadIn(plugin, 'build', '\0virtual:flowmock-critical.css?inline')).result).toBe(criticalCss);
  });

  it('serves the URL form from its own dev path, versioned by content', async () => {
    const plugin = typescriptStylesheets(FLOWMOCK_STYLESHEETS);
    const { result } = await loadIn(plugin, 'dev', '\0virtual:flowmock-winui.css?url');
    const url = JSON.parse(String(result).replace(/^export default /, '')) as string;
    expect(url).toMatch(/^\/@flowmock\/stylesheet\/virtual:flowmock-winui\.css\?v=[0-9a-f]{8}$/);

    let middleware: ((request: { url: string }, response: unknown, next: () => void) => void) | undefined;
    const use = (path: string, handler: typeof middleware) => {
      expect(path).toBe('/@flowmock/stylesheet/');
      middleware = handler;
    };
    const server = { middlewares: { use } } as unknown as ViteDevServer;
    await (plugin.configureServer as Hook<'configureServer'>).call({} as never, server);

    const headers: Record<string, string> = {};
    let body: string | undefined;
    const response = { setHeader: (name: string, value: string) => { headers[name] = value; }, end: (text: string) => { body = text; } };
    let passed = false;
    middleware!({ url: `/${url.slice('/@flowmock/stylesheet/'.length)}` }, response, () => { passed = true; });
    expect(passed).toBe(false);
    expect(headers['content-type']).toBe('text/css');
    expect(body).toBe(winuiCss);

    middleware!({ url: '/virtual:flowmock-unknown.css' }, response, () => { passed = true; });
    expect(passed).toBe(true);
  });
});
