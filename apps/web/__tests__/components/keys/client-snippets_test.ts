import { describe, expect, it } from 'vitest';

import { clientSnippets } from '../../../src/components/keys/client-snippets.tsx';

const snippets = Object.fromEntries(clientSnippets('http://127.0.0.1:8787', 'fm-demo-replay').map(snippet => [snippet.id, snippet.code]));

describe('client snippets', () => {
  it('put the key in every snippet', () => {
    for (const code of Object.values(snippets)) expect(code).toContain('fm-demo-replay');
  });

  it('point the OpenAI protocols under /v1 and the others at the origin', () => {
    expect(snippets.openai).toContain('baseURL: \'http://127.0.0.1:8787/v1\'');
    expect(snippets.codex).toContain('base_url = "http://127.0.0.1:8787/v1"');
    expect(snippets.codex).toContain('wire_api = "responses"');
    expect(snippets.anthropic).toContain('baseURL: \'http://127.0.0.1:8787\' })');
    expect(snippets.gemini).toContain('httpOptions: { baseUrl: \'http://127.0.0.1:8787\' }');
    expect(snippets['claude-code']).toBe('ANTHROPIC_BASE_URL=http://127.0.0.1:8787 ANTHROPIC_API_KEY=fm-demo-replay claude');
    expect(snippets.curl).toContain('curl http://127.0.0.1:8787/v1/messages');
  });
});
