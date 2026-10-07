import type { BadgeTone } from '@flowmock/ui/controls/status-badge.tsx';

// A recording's or a replay's outcome is an identifier the server writes --
// ok, http_error:<status>, stream_error:<type>, truncated, client_aborted,
// network_error for a recording; completed, interrupted, client_aborted,
// failed for a replay -- shown verbatim, and toned by what it says about the
// exchange: a refused request or a replay that could not be written is an
// error, an error event inside a stream that otherwise completed or a replay a
// fault cut short is a warning, and a client's own abort says nothing either
// way.
export const outcomeTone = (outcome: string | null): BadgeTone => {
  if (outcome === null) return 'neutral';
  if (outcome === 'ok' || outcome === 'completed' || outcome === 'proxied') return 'success';
  if (outcome.startsWith('http_error:') || outcome === 'failed') return 'danger';
  if (outcome.startsWith('stream_error:') || outcome === 'interrupted') return 'warning';
  return 'neutral';
};

// The values the outcome filter offers; the server matches them as globs.
export const OUTCOME_FILTERS = ['ok', 'http_error:*', 'stream_error:*', 'truncated', 'client_aborted', 'network_error'] as const;

// A status by its class: a 4xx refusal is a warning, a 5xx failure an error.
export const statusTone = (status: number | null): BadgeTone =>
  status === null ? 'neutral' : status >= 500 ? 'danger' : status >= 400 ? 'warning' : 'success';

// A replay that wrote a recorded error ran to completion, so its outcome is
// `completed` while its status says the client was refused. The badge then
// takes the status's tone, so a green outcome never sits beside a 429.
export const requestOutcomeTone = (outcome: string | null, status: number | null): BadgeTone => {
  const tone = outcomeTone(outcome);
  return tone === 'success' && status !== null && status >= 400 ? statusTone(status) : tone;
};
