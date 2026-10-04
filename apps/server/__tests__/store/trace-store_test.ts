import { describe, expect, it } from 'vitest';

import { openDatabase } from '../../src/store/database.ts';
import { TraceStore } from '../../src/store/trace-store.ts';
import { timelineEntry } from '../support/timeline.ts';

describe('TraceStore', () => {
  it('caps persisted frames without changing the original trace', () => {
    const db = openDatabase(':memory:');
    try {
      const store = new TraceStore(db);
      const entry = timelineEntry('req_frames', 0, {
        trace: {
          scenario: 'default', seed: 's', sessionId: 'session', callIndex: 1, fingerprint: 'f', selection: null, misses: [], recordingId: null, fault: null, provenance: [], error: null,
          frames: Array.from({ length: 600 }, () => ({ at: 0, origin: 'recorded', content: true, tokens: 1, label: null, bytes: 1 })),
        },
      });
      store.add(entry);
      expect(store.get(entry.id)?.trace?.frames).toHaveLength(500);
      expect(entry.trace?.frames).toHaveLength(600);
    } finally { db.close(); }
  });
  it('orders ties by id, pages before filtering and enforces size and age limits', () => {
    const db = openDatabase(':memory:');
    try {
      const store = new TraceStore(db, { retainDays: 1, maxEntries: 3 });
      for (let index = 0; index < 4; index++) store.add(timelineEntry(`req_${index}`, index < 2 ? 0 : 1000, { outcome: index === 2 ? 'failed' : 'completed' }));
      expect(store.list(10).map(entry => entry.id)).toEqual(['req_3', 'req_2', 'req_1']);
      expect(store.list(10, { before: 'req_3', outcome: 'completed' }).map(entry => entry.id)).toEqual(['req_1']);
      store.prune(86_400_001);
      expect(store.get('req_1')).toBeNull();
      expect(store.list(10).map(entry => entry.id)).toEqual(['req_3', 'req_2']);
    } finally { db.close(); }
  });
});
