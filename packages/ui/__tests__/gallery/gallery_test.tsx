import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Gallery } from '../../src/gallery/gallery.tsx';
import { renderInApp } from '../render.tsx';

// The gallery mounts the lazy editors; what Monaco itself does is the editor
// suites' concern, so it is stood in for here.
vi.mock('monaco-editor', () => {
  const model = { dispose: () => {}, getValue: () => '', onDidChangeContent: () => ({ dispose: () => {} }), setValue: () => {}, uri: { toString: () => 'file:///gallery.yaml' } };
  const editor = { dispose: () => {}, getAction: () => null, getModel: () => model, setScrollTop: () => {}, updateOptions: () => {} };
  return { editor: { create: () => editor, createModel: () => model, setModelLanguage: () => {} }, Uri: { parse: (value: string) => value } };
});
vi.mock('monaco-yaml', () => ({ configureMonacoYaml: () => ({ update: async () => {}, dispose: () => {} }) }));
vi.mock('../../src/controls/monaco-workers.ts', () => ({ registerMonacoWorker: () => {} }));
vi.mock('../../src/controls/yaml.worker.ts?worker', () => ({ default: class {} }));

const basename = (path: string) => path.split('/').at(-1)!.replace(/\.css\.ts$|\.tsx$/, '');

// Derived from the tree rather than listed, so a module ported later and never
// mounted here fails this suite instead of passing unnoticed.
const renderingModules = [
  ...Object.keys(import.meta.glob('../../src/controls/*.tsx')).map(path => `controls/${basename(path)}`),
  ...Object.keys(import.meta.glob('../../src/charts/*.tsx')).map(path => `charts/${basename(path)}`),
];
// Every restyled Fluent family has a section of its own; the scrollbar sheet
// paints the scroll area rather than a Fluent component.
const restyledFamilies = Object.keys(import.meta.glob('../../src/winui/controls/*.css.ts'))
  .map(basename)
  .map(name => name === 'scrollbar' ? 'controls/scroll-area' : `winui/${name}`);

describe('Gallery', () => {
  it('mounts every rendering module and every restyled family', () => {
    const router = createMemoryRouter([{ path: '*', element: <Gallery /> }]);
    const { container } = renderInApp(<RouterProvider router={router} />);

    const items = new Set([...container.querySelectorAll('[data-gallery-item]')].map(element => element.getAttribute('data-gallery-item')));
    expect(renderingModules.length).toBeGreaterThan(20);
    for (const item of [...renderingModules, ...restyledFamilies]) expect(items, item).toContain(item);
  });
});
