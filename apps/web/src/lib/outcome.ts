import type { BadgeTone } from '@flowmock/ui/controls/status-badge.tsx';

// A recording's or a replay's outcome is an identifier the server writes --
// ok, http_error:<status>, stream_error:<type>, truncated, client_aborted,
// network_error -- shown verbatim, and toned by what it says about the
// exchange: a refused request is an error, an error event inside a stream that
// otherwise completed is a warning, and a cut-short exchange says nothing
// about the upstream either way.
export const outcomeTone = (outcome: string | null): BadgeTone => {
  if (outcome === null) return 'neutral';
  if (outcome === 'ok' || outcome === 'completed' || outcome === 'proxied') return 'success';
  if (outcome.startsWith('http_error:')) return 'danger';
  if (outcome.startsWith('stream_error:')) return 'warning';
  return 'neutral';
};

// The values the outcome filter offers; the server matches them as globs.
export const OUTCOME_FILTERS = ['ok', 'http_error:*', 'stream_error:*', 'truncated', 'client_aborted', 'network_error'] as const;
