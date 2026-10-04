import type { TimelineEntry } from '../../src/state/timeline.ts';

export const timelineEntry = (id: string, startedAt: number, patch: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id, startedAt, mode: 'replay', keyName: 'demo', protocol: 'anthropic-messages', transport: 'http', method: 'POST', path: '/v1/messages', model: 'claude',
  status: 200, durationMs: 10, recordingId: null, cassetteId: null, trace: null, result: null, expected: null, outcome: 'completed', error: null, ...patch,
});
