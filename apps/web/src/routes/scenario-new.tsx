import type { ClientLoaderFunctionArgs } from 'react-router';

import { loadScenarioEditor } from './scenario-editor.tsx';

// The editor, opened on a scenario not yet saved.
export async function clientLoader({ request }: Pick<ClientLoaderFunctionArgs, 'request'>) {
  return await loadScenarioEditor(null, request);
}

export { default } from './scenario-editor.tsx';
