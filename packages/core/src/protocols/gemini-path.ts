// Gemini names the model and the action in the path:
// `/v1beta/models/{model}:{generateContent|streamGenerateContent}`, with
// `alt=sse` selecting SSE over the default JSON array stream.
// https://ai.google.dev/api/generate-content
export interface GeminiPathInfo {
  model: string;
  action: string;
  stream: boolean;
  streamWire: 'sse' | 'json-array';
}

export const parseGeminiPath = (pathWithQuery: string): GeminiPathInfo | null => {
  const url = new URL(pathWithQuery, 'http://flowmock.invalid');
  const match = /\/models\/([^/:]+):([A-Za-z]+)$/.exec(decodeURIComponent(url.pathname));
  if (!match) return null;
  const [, model, action] = match;
  return {
    model,
    action,
    stream: action === 'streamGenerateContent',
    streamWire: url.searchParams.get('alt') === 'sse' ? 'sse' : 'json-array',
  };
};
