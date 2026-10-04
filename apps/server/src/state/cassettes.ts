import type { SqliteCorpus } from '../store/corpus-store.ts';

interface OpenCassette {
  id: string;
  nextSeq: number;
  lastActivity: number;
}

// Groups recordings into cassettes: one per recording key and session, so
// one run of a client becomes one cassette. A session idle for longer than
// `idleMs`, or a cassette closed through the API, starts a new cassette.
export class CassetteTracker {
  private readonly open = new Map<string, OpenCassette>();
  private readonly corpus: SqliteCorpus;
  private readonly idleMs: number;

  constructor(corpus: SqliteCorpus, idleMs = 30 * 60_000) {
    this.corpus = corpus;
    this.idleMs = idleMs;
  }

  // Reserves the next position at request start, so concurrent requests are
  // ordered by when they began.
  claim(input: { keyName: string; key: string; targetId: string; sessionId: string }, now = Date.now()): { cassetteId: string; seq: number } {
    const slot = `${input.key}\u0000${input.sessionId}`;
    let current = this.open.get(slot);
    const closed = current ? this.corpus.cassette(current.id)?.closedAt != null : false;
    if (!current || closed || now - current.lastActivity > this.idleMs) {
      const stamp = new Date(now).toISOString().replace('T', ' ').slice(0, 19);
      const cassette = this.corpus.createCassette({ name: `${input.keyName} ${stamp}`, keyName: input.keyName, targetId: input.targetId, sessionId: input.sessionId }, now);
      current = { id: cassette.id, nextSeq: 1, lastActivity: now };
      this.open.set(slot, current);
    }
    current.lastActivity = now;
    return { cassetteId: current.id, seq: current.nextSeq++ };
  }
}
