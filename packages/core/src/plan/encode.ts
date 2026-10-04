import type { PlannedWrite, ReplayDraft, ReplayPlan } from './types.ts';

const encoder = new TextEncoder();

// Turns a scheduled draft into one write per frame (or per recorded chunk
// under raw fidelity). Network shaping then works on these writes.
export const encodePlan = (draft: ReplayDraft): ReplayPlan => {
  const writes: PlannedWrite[] = [];
  if (draft.rawChunks) {
    for (const chunk of draft.rawChunks) {
      writes.push({ at: Math.max(chunk.at, draft.headersAt), bytes: chunk.bytes, frame: -1, content: false, first: true, last: true, tokens: 0 });
    }
  } else {
    for (const [index, frame] of draft.frames.entries()) {
      if (frame.raw.length === 0) continue;
      const at = Math.max(frame.at, draft.headersAt);
      const piece = draft.transport === 'ws' ? { text: frame.raw } : { bytes: encoder.encode(frame.raw) };
      writes.push({ at, ...piece, frame: index, content: frame.content, first: true, last: true, tokens: frame.tokens });
    }
  }
  // Writes never go out of order, even when a transform scheduled a later
  // frame earlier.
  let floor = draft.headersAt;
  for (const write of writes) {
    write.at = Math.max(write.at, floor);
    floor = write.at;
  }
  const endAt = Math.max(draft.endAt ?? floor, floor);

  const contentWrites = writes.filter(write => write.content);
  const firstContent = contentWrites[0];
  const lastContent = contentWrites.at(-1);
  const decodedTokens = draft.outputTokens - (firstContent?.tokens ?? 0);
  const span = firstContent && lastContent ? lastContent.at - firstContent.at : 0;
  return {
    transport: draft.transport,
    status: draft.status,
    headers: draft.headers,
    headersAt: draft.headersAt,
    writes,
    end: { ...draft.end, at: endAt },
    outputTokens: draft.outputTokens,
    expected: {
      ttftMs: firstContent?.at ?? null,
      tps: span > 0 && decodedTokens > 0 ? (decodedTokens * 1000) / span : null,
      durationMs: endAt,
    },
  };
};
