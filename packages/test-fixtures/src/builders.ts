export type FixtureProtocol = 'anthropic-messages' | 'openai-chat-completions' | 'openai-responses' | 'gemini-generate-content';

export interface FixtureChunk {
  // Milliseconds since the request was dispatched upstream.
  t: number;
  text: string;
}

export interface FixtureExpectation {
  outcome: string;
  stream: boolean;
  stopReason?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls: number;
  reasoning: boolean;
  // Concatenated assistant text, when the exchange produced any.
  text?: string;
}

export interface ExchangeFixture {
  id: string;
  protocol: FixtureProtocol;
  description: string;
  request: {
    method: 'POST';
    path: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  response: {
    status: number;
    // Milliseconds since dispatch at which the status line and headers arrived.
    headersAt: number;
    headers: Record<string, string>;
    chunks: FixtureChunk[];
  };
  expect: FixtureExpectation;
}

export interface TimedEvent {
  t: number;
  // Exact wire text of one SSE block or JSON-array element, separators included.
  text: string;
}

// Groups consecutive events that share a timestamp into one chunk, the way a
// TCP read coalesces writes that land together.
export const chunksFromEvents = (events: readonly TimedEvent[]): FixtureChunk[] => {
  const chunks: FixtureChunk[] = [];
  for (const event of events) {
    const last = chunks.at(-1);
    if (last?.t === event.t) last.text += event.text;
    else chunks.push({ t: event.t, text: event.text });
  }
  return chunks;
};

export const sseBlock = (data: string, options: { event?: string; lineEnd?: string } = {}): string => {
  const lineEnd = options.lineEnd ?? '\n';
  const eventLine = options.event === undefined ? '' : `event: ${options.event}${lineEnd}`;
  return `${eventLine}data: ${data}${lineEnd}${lineEnd}`;
};

// Google's compact JSON spelling: `": "` after keys, bare `,` between members.
export const googleJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(googleJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => `${JSON.stringify(key)}: ${googleJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

// Spreads `count` events evenly between `from` and `to`, rounding to whole
// milliseconds.
export const spread = (count: number, from: number, to: number): number[] =>
  Array.from({ length: count }, (_, index) => (count === 1 ? from : Math.round(from + ((to - from) * index) / (count - 1))));
