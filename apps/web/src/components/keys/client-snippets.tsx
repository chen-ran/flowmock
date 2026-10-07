import { useState } from 'react';

import { useTranslation } from '../../i18n/translation.ts';
import { ChoiceGroup } from '@flowmock/ui/controls/choice-group.tsx';
import { CodeBlock } from '@flowmock/ui/controls/code-block.tsx';
import { useCopyToClipboard } from '@flowmock/ui/controls/use-copy-to-clipboard.ts';

export const SNIPPET_IDS = ['anthropic', 'openai', 'gemini', 'curl', 'claude-code', 'codex'] as const;
export type SnippetId = typeof SNIPPET_IDS[number];

export interface ClientSnippet {
  id: SnippetId;
  language: 'typescript' | 'bash' | 'toml';
  code: string;
}

// How each client reaches FlowMock with a key, written the way the README's
// "Connecting clients" section writes them: Anthropic and Gemini at the
// origin, the OpenAI protocols under /v1.
export const clientSnippets = (origin: string, key: string): ClientSnippet[] => [
  {
    id: 'anthropic',
    language: 'typescript',
    code: `import Anthropic from '@anthropic-ai/sdk';\n\nconst anthropic = new Anthropic({ apiKey: '${key}', baseURL: '${origin}' });`,
  },
  {
    id: 'openai',
    language: 'typescript',
    code: `import OpenAI from 'openai';\n\nconst openai = new OpenAI({ apiKey: '${key}', baseURL: '${origin}/v1' });`,
  },
  {
    id: 'gemini',
    language: 'typescript',
    code: `import { GoogleGenAI } from '@google/genai';\n\nconst gemini = new GoogleGenAI({ apiKey: '${key}', httpOptions: { baseUrl: '${origin}' } });`,
  },
  {
    id: 'curl',
    language: 'bash',
    code: [
      `curl ${origin}/v1/messages \\`,
      `  -H 'x-api-key: ${key}' \\`,
      '  -H \'anthropic-version: 2023-06-01\' \\',
      '  -H \'content-type: application/json\' \\',
      '  -d \'{"model":"claude-sonnet-4-5","max_tokens":256,"messages":[{"role":"user","content":"Hello"}]}\'',
    ].join('\n'),
  },
  {
    id: 'claude-code',
    language: 'bash',
    code: `ANTHROPIC_BASE_URL=${origin} ANTHROPIC_API_KEY=${key} claude`,
  },
  {
    id: 'codex',
    language: 'toml',
    code: [
      '# ~/.codex/config.toml, with FLOWMOCK_KEY set in the environment:',
      `#   export FLOWMOCK_KEY=${key}`,
      'model_provider = "flowmock"',
      '',
      '[model_providers.flowmock]',
      'name = "FlowMock"',
      `base_url = "${origin}/v1"`,
      'env_key = "FLOWMOCK_KEY"',
      'wire_api = "responses"',
    ].join('\n'),
  },
];

export function ClientSnippets({ apiKey, origin }: { apiKey: string; origin: string }) {
  const { t } = useTranslation();
  const snippets = clientSnippets(origin, apiKey);
  const [shown, setShown] = useState<SnippetId>('anthropic');
  const copy = useCopyToClipboard();
  const snippet = snippets.find(item => item.id === shown)!;
  return <div className="grid gap-3 min-w-0">
    <ChoiceGroup
      ariaLabel={t('keys.snippets.label')}
      items={snippets.map(item => ({ value: item.id, label: t(`keys.snippets.clients.${item.id}`) }))}
      onChange={value => setShown(value as SnippetId)}
      value={shown}
    />
    <CodeBlock code={snippet.code} copyOutcome={copy.outcomeFor(snippet.id)} language={snippet.language} onCopy={() => copy.copy(snippet.code, snippet.id)} />
  </div>;
}
