// Ported from Floway apps/web/src/components/ui/monaco-workers.ts (MIT). See NOTICE.md.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker';

import { ignoreMonacoCancellations } from './monaco-cancellation.ts';

const workers = new Map<string, () => Worker>([
  ['json', () => new JsonWorker()],
]);

// Language workers implement methods absent from the base editor worker.
// https://github.com/microsoft/monaco-editor/blob/v0.54.0/docs/integrate-esm.md#using-vite
(globalThis as typeof globalThis & { MonacoEnvironment: { getWorker: (moduleId: string, label: string) => Worker } }).MonacoEnvironment = {
  getWorker: (_moduleId, label) => workers.get(label)?.() ?? new EditorWorker(),
};

export const registerMonacoWorker = (label: string, create: () => Worker): void => {
  workers.set(label, create);
};

// Every editor reaches Monaco through here, so the cancellations editors leave
// behind are dropped once, for all of them.
ignoreMonacoCancellations(window);
