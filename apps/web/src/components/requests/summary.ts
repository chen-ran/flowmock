import type { TimelineEntry } from '../../api/types.ts';

// A request as the list shows it: what /api/requests/stream sends for each new
// one, and what a fetched page is cut down to, so both fill the same rows.
// The stream's shape is restated from apps/server/src/state/timeline.ts.
export interface RequestSummary {
  id: string;
  startedAt: number;
  mode: 'record' | 'replay';
  keyName: string;
  protocol: string;
  transport: 'http' | 'ws';
  model: string | null;
  status: number | null;
  durationMs: number | null;
  outcome: string | null;
  recordingId: string | null;
  achievedTtftMs: number | null;
  achievedTps: number | null;
  fault: string | null;
}

export const summaryOf = (entry: TimelineEntry): RequestSummary => ({
  id: entry.id,
  startedAt: entry.startedAt,
  mode: entry.mode,
  keyName: entry.keyName,
  protocol: entry.protocol,
  transport: entry.transport,
  model: entry.model,
  status: entry.status,
  durationMs: entry.durationMs,
  outcome: entry.outcome,
  recordingId: entry.recordingId,
  achievedTtftMs: entry.result?.achievedTtftMs ?? null,
  achievedTps: entry.result?.achievedTps ?? null,
  fault: entry.trace?.fault?.type ?? null,
});

export interface RequestFilterValues {
  mode: string;
  key: string;
  protocol: string;
  status: string;
  outcome: string;
}

// The server filters a fetched page; a streamed request is held to the same
// filters here before it joins the list.
export const matchesFilters = (item: RequestSummary, filters: RequestFilterValues): boolean =>
  (!filters.mode || item.mode === filters.mode)
  && (!filters.key || item.keyName === filters.key)
  && (!filters.protocol || item.protocol === filters.protocol)
  && (!filters.outcome || item.outcome === filters.outcome)
  && (!filters.status || (item.status !== null && String(item.status).startsWith(filters.status.charAt(0))));
