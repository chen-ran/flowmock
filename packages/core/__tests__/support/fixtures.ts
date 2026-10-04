import { buildRecording, detectResponseWire, parseGeminiPath, prepareRequest, type PreparedRequest, type Recording } from '../../src/index.ts';
import type { ExchangeFixture } from '@flowmock/test-fixtures';

const encoder = new TextEncoder();

export const prepareFixtureRequest = (fixture: ExchangeFixture, overrides: { body?: Record<string, unknown>; transport?: 'http' | 'ws'; history?: unknown[] | null; session?: string } = {}): PreparedRequest => {
  const gemini = fixture.protocol === 'gemini-generate-content' ? parseGeminiPath(fixture.request.path) : null;
  return prepareRequest({
    protocol: fixture.protocol,
    transport: overrides.transport ?? 'http',
    body: overrides.body ?? fixture.request.body,
    ...(gemini ? { pathModel: gemini.model, pathStream: gemini.stream, streamWire: gemini.streamWire } : {}),
    history: overrides.history ?? null,
    session: overrides.session ?? null,
  });
};

export const fixtureRecording = (fixture: ExchangeFixture, options: { id?: string; cassetteId?: string; seq?: number; createdAt?: number } = {}): Recording => {
  const prepared = prepareFixtureRequest(fixture);
  const gemini = fixture.protocol === 'gemini-generate-content' ? parseGeminiPath(fixture.request.path) : null;
  const chunks = fixture.response.chunks.map(chunk => ({ t: chunk.t, bytes: encoder.encode(chunk.text) }));
  return buildRecording({
    id: options.id ?? `rec_${fixture.id}`,
    createdAt: options.createdAt ?? 1_759_550_400_000,
    transport: 'http',
    request: { method: 'POST', path: fixture.request.path, headers: Object.entries(fixture.request.headers), body: fixture.request.body },
    response: {
      status: fixture.response.status,
      headers: Object.entries(fixture.response.headers),
      headersAt: fixture.response.headersAt,
      wire: detectResponseWire({
        status: fixture.response.status,
        contentType: fixture.response.headers['content-type'] ?? null,
        stream: prepared.stream,
        streamWire: gemini?.streamWire ?? 'sse',
      }),
      chunks,
      complete: true,
      endedAt: fixture.response.chunks.at(-1)?.t ?? fixture.response.headersAt,
    },
    prepared,
    cassetteId: options.cassetteId ?? null,
    cassetteSeq: options.seq ?? null,
  });
};
