import { screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../render.tsx';

// Monaco is the largest thing an app can load, and it is worth its size only to
// the surfaces that show an editor. The property under test is that reaching
// the editors costs nothing until one renders: the module graph behind the lazy
// wrappers must not evaluate monaco-editor or monaco-yaml on import.
const loaded = vi.hoisted(() => new Set<string>());

vi.mock('monaco-editor', () => {
  loaded.add('monaco-editor');
  const model = { dispose: () => {}, getValue: () => '', onDidChangeContent: () => ({ dispose: () => {} }), setValue: () => {} };
  const editor = { dispose: () => {}, getAction: () => null, getModel: () => model, setScrollTop: () => {}, updateOptions: () => {} };
  return { editor: { create: () => editor, createModel: () => model, setModelLanguage: () => {} }, Uri: { parse: (value: string) => value } };
});
vi.mock('monaco-yaml', () => {
  loaded.add('monaco-yaml');
  return { configureMonacoYaml: () => ({ update: async () => {}, dispose: () => {} }) };
});
// The workers are Vite ?worker modules, which only the browser build resolves.
vi.mock('../../src/controls/monaco-workers.ts', () => ({ registerMonacoWorker: () => {} }));
vi.mock('../../src/controls/yaml.worker.ts?worker', () => ({ default: class {} }));

const { LazyBodyEditor, LazyYamlEditor } = await import('../../src/controls/lazy-editors.ts');

describe('the lazy editors', () => {
  it('leave Monaco unevaluated until an editor renders', () => {
    expect([...loaded]).toEqual([]);
  });

  it('load the read-only body editor on first render', async () => {
    renderInApp(<Suspense fallback="loading"><LazyBodyEditor json label="Response body" text="{}" /></Suspense>);
    expect(await screen.findByRole('button', { name: 'Find in body' })).toBeTruthy();
    expect(loaded.has('monaco-editor')).toBe(true);
    expect(loaded.has('monaco-yaml')).toBe(false);
  });

  it('load the YAML editor and its language service on first render', async () => {
    renderInApp(<Suspense fallback="loading"><LazyYamlEditor label="Scenario" onChange={() => {}} value="name: demo" /></Suspense>);
    await waitFor(() => expect(loaded.has('monaco-yaml')).toBe(true));
  });
});
