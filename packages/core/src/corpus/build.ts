import { recordingFeatures } from './analyze.ts';
import type { RecordedRequest, RecordedResponse, Recording } from './types.ts';
import type { PreparedRequest } from '../engine.ts';
import { adapterFor } from '../protocols/registry.ts';

export interface CaptureInput {
  id: string;
  createdAt: number;
  transport: 'http' | 'ws';
  request: RecordedRequest;
  response: RecordedResponse;
  // The same preparation replay applies, so the stored fingerprint is the
  // one a replayed request will compute.
  prepared: PreparedRequest;
  cassetteId: string | null;
  cassetteSeq: number | null;
}

export const buildRecording = (input: CaptureInput): Recording => {
  const { prepared } = input;
  const adapter = adapterFor(prepared.protocol);
  return {
    id: input.id,
    createdAt: input.createdAt,
    protocol: prepared.protocol,
    transport: input.transport,
    model: prepared.normalized.model,
    request: input.request,
    response: input.response,
    features: recordingFeatures(adapter, input.response, prepared.normalized),
    fingerprint: prepared.fingerprint.fingerprint,
    prefixHashes: prepared.fingerprint.prefixHashes,
    sessionId: prepared.sessionId,
    cassetteId: input.cassetteId,
    cassetteSeq: input.cassetteSeq,
  };
};
