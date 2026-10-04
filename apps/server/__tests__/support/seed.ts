
import type { Services } from '../../src/services.ts';
import { buildRecording, detectResponseWire, newId, parseGeminiPath, prepareRequest, type Recording } from '@flowmock/core';
import type { ExchangeFixture } from '@flowmock/test-fixtures';

const encoder = new TextEncoder();

// Stores a fixture as if it had been recorded, without a proxy round trip.
export const seedFixture = async (services: Services, fixture: ExchangeFixture, options: { cassetteId?: string; seq?: number } = {}): Promise<Recording> => {
  const gemini = fixture.protocol === 'gemini-generate-content' ? parseGeminiPath(fixture.request.path) : null;
  const prepared = prepareRequest({
    protocol: fixture.protocol,
    transport: 'http',
    body: fixture.request.body,
    ...(gemini ? { pathModel: gemini.model, pathStream: gemini.stream, streamWire: gemini.streamWire } : {}),
  });
  const recording = buildRecording({
    id: newId('rec'),
    createdAt: Date.now(),
    transport: 'http',
    request: { method: 'POST', path: fixture.request.path, headers: [], body: fixture.request.body },
    response: {
      status: fixture.response.status,
      headers: Object.entries(fixture.response.headers),
      headersAt: fixture.response.headersAt,
      wire: detectResponseWire({ status: fixture.response.status, contentType: fixture.response.headers['content-type'] ?? null, stream: prepared.stream, streamWire: gemini?.streamWire ?? 'sse' }),
      chunks: fixture.response.chunks.map(chunk => ({ t: chunk.t, bytes: encoder.encode(chunk.text) })),
      complete: true,
      endedAt: fixture.response.chunks.at(-1)?.t ?? fixture.response.headersAt,
    },
    prepared,
    cassetteId: options.cassetteId ?? null,
    cassetteSeq: options.seq ?? null,
  });
  await services.corpus.saveRecording(recording);
  return recording;
};
