import type { InferResponseType } from 'hono/client';

import type { api } from './client.ts';

// Response shapes are read off the typed client, so a page and the server it
// talks to cannot disagree about a field without the typecheck noticing.
export type RecordingList = InferResponseType<typeof api.recordings.$get, 200>;
export type RecordingSummary = RecordingList['items'][number];
export type RecordingDetail = InferResponseType<typeof api.recordings[':id']['$get'], 200>;
export type RecordingFrame = RecordingDetail['frames'][number];
export type RecordedChunkSummary = RecordingDetail['response']['chunks'][number];
