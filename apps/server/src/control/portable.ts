import { z } from 'zod';

import type { Services } from '../services.ts';
import { ConfigError } from '../store/config-store.ts';
import type { Recording, RecordingFeatures } from '@flowmock/core';
import { PROTOCOLS, WIRE_FORMATS } from '@flowmock/protocols/common';

// Newline-delimited JSON a corpus can be shared or checked in with: cassette
// lines first, then one line per recording with its chunks in base64.
const CASSETTE_FORMAT = 'flowmock.cassette/v1';
const RECORDING_FORMAT = 'flowmock.recording/v1';

const headerList = z.array(z.tuple([z.string(), z.string()]));

const cassetteLine = z.object({
  format: z.literal(CASSETTE_FORMAT),
  cassette: z.object({ id: z.string(), name: z.string(), createdAt: z.number(), description: z.string().nullable().optional() }).loose(),
});

const nullableNumber = z.number().nullable();

const featuresSchema = z.object({
  stream: z.boolean(),
  outcome: z.string(),
  stopReason: z.string().nullable(),
  inputTokens: nullableNumber,
  outputTokens: nullableNumber,
  toolCalls: z.number(),
  toolNames: z.array(z.string()),
  reasoning: z.boolean(),
  hasTools: z.boolean(),
  requestToolNames: z.array(z.string()),
  reasoningRequested: z.boolean(),
  inputChars: z.number(),
  ttftMs: nullableNumber,
  tps: nullableNumber,
  durationMs: z.number(),
  responseModel: z.string().nullable(),
  frames: z.number(),
  bytes: z.number(),
}) satisfies z.ZodType<RecordingFeatures>;

const recordingLine = z.object({
  format: z.literal(RECORDING_FORMAT),
  recording: z.object({
    id: z.string(),
    createdAt: z.number(),
    protocol: z.enum(PROTOCOLS),
    transport: z.enum(['http', 'ws']),
    model: z.string().nullable(),
    request: z.object({ method: z.string(), path: z.string(), headers: headerList, body: z.unknown() }),
    response: z.object({
      status: z.number().int(),
      headers: headerList,
      headersAt: z.number(),
      wire: z.enum(WIRE_FORMATS),
      chunks: z.array(z.object({ t: z.number(), b64: z.string() })),
      complete: z.boolean(),
      endedAt: z.number(),
    }),
    features: featuresSchema,
    fingerprint: z.string(),
    prefixHashes: z.array(z.string()),
    sessionId: z.string().nullable(),
    cassetteId: z.string().nullable(),
    cassetteSeq: z.number().nullable(),
  }),
});

const recordingToLine = (recording: Recording): string => JSON.stringify({
  format: RECORDING_FORMAT,
  recording: {
    ...recording,
    response: { ...recording.response, chunks: recording.response.chunks.map(chunk => ({ t: chunk.t, b64: Buffer.from(chunk.bytes).toString('base64') })) },
  },
});

export const exportCorpus = async (services: Services, filter: { cassetteId?: string }): Promise<string> => {
  const lines: string[] = [];
  const cassettes = filter.cassetteId === undefined ? services.corpus.listCassettes() : [services.corpus.cassette(filter.cassetteId)].filter(cassette => cassette !== null);
  if (filter.cassetteId !== undefined && cassettes.length === 0) throw new ConfigError(`cassette ${filter.cassetteId} does not exist`, 404);
  for (const cassette of cassettes) lines.push(JSON.stringify({ format: CASSETTE_FORMAT, cassette: { id: cassette.id, name: cassette.name, createdAt: cassette.createdAt, description: cassette.description } }));
  for (let offset = 0; ; offset += 500) {
    const page = services.corpus.list({ cassetteId: filter.cassetteId, limit: 500, offset });
    for (const summary of page.items) {
      const recording = await services.corpus.getRecording(summary.id);
      if (recording) lines.push(recordingToLine(recording));
    }
    if (page.items.length < 500) break;
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
};

// Imports keep ids, so importing the same file twice is a no-op.
export const importCorpus = async (services: Services, text: string): Promise<{ cassettes: number; recordings: number; skipped: number }> => {
  let cassettes = 0;
  let recordings = 0;
  let skipped = 0;
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new ConfigError(`line ${index + 1} is not JSON`);
    }
    const format = (value as { format?: unknown }).format;
    if (format === CASSETTE_FORMAT) {
      const { cassette } = cassetteLine.parse(value);
      if (services.corpus.cassette(cassette.id)) { skipped++; continue; }
      services.db.prepare('INSERT INTO cassettes (id, name, created_at, updated_at, description, closed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(cassette.id, cassette.name, cassette.createdAt, Date.now(), cassette.description ?? null, Date.now());
      cassettes++;
      continue;
    }
    if (format !== RECORDING_FORMAT) throw new ConfigError(`line ${index + 1}: unknown format ${String(format)}`);
    const parsed = recordingLine.safeParse(value);
    if (!parsed.success) throw new ConfigError(`line ${index + 1}: ${z.prettifyError(parsed.error)}`);
    const input = parsed.data.recording;
    if (await services.corpus.getRecording(input.id)) { skipped++; continue; }
    const cassetteId = input.cassetteId !== null && services.corpus.cassette(input.cassetteId) ? input.cassetteId : null;
    const recording: Recording = {
      ...input,
      cassetteId,
      cassetteSeq: cassetteId === null ? null : input.cassetteSeq,
      response: { ...input.response, chunks: input.response.chunks.map(chunk => ({ t: chunk.t, bytes: new Uint8Array(Buffer.from(chunk.b64, 'base64')) })) },
    };
    await services.corpus.saveRecording(recording);
    recordings++;
  }
  return { cassettes, recordings, skipped };
};
