import type { DatabaseSync } from 'node:sqlite';

import { nodeClock } from './runtime/clock.ts';
import { CassetteTracker } from './state/cassettes.ts';
import { ConversationMemory } from './state/conversations.ts';
import { fromEntry, LiveAggregator } from './state/live.ts';
import { Metrics } from './state/metrics.ts';
import { SessionState } from './state/sessions.ts';
import { Timeline } from './state/timeline.ts';
import { AdminSessions } from './store/admin-sessions.ts';
import { ChunkFiles } from './store/chunk-files.ts';
import { ConfigStore } from './store/config-store.ts';
import { SqliteCorpus } from './store/corpus-store.ts';
import type { Clock } from '@flowmock/core';

export interface Services {
  db: DatabaseSync;
  corpus: SqliteCorpus;
  config: ConfigStore;
  sessions: SessionState;
  conversations: ConversationMemory;
  timeline: Timeline;
  metrics: Metrics;
  cassettes: CassetteTracker;
  clock: Clock;
  // Bearer token for the control plane; null leaves it open (loopback only).
  adminKey: string | null;
  adminSessions: AdminSessions;
  live: LiveAggregator;
}

export interface ServiceOptions {
  db: DatabaseSync;
  chunkDir: string;
  adminKey?: string | null;
  clock?: Clock;
  cassetteIdleMs?: number;
  timelineSize?: number;
}

export const createServices = (options: ServiceOptions): Services => {
  const corpus = new SqliteCorpus(options.db, new ChunkFiles(options.chunkDir));
  const sessions = new SessionState();
  const timeline = new Timeline(options.timelineSize);
  const live = new LiveAggregator(() => sessions.active());
  timeline.subscribe(entry => live.observe(fromEntry(entry)));
  return {
    db: options.db,
    corpus,
    config: new ConfigStore(options.db),
    sessions,
    conversations: new ConversationMemory(),
    timeline,
    live,
    metrics: new Metrics(() => sessions.active()),
    cassettes: new CassetteTracker(corpus, options.cassetteIdleMs),
    clock: options.clock ?? nodeClock,
    adminKey: options.adminKey ?? null,
    adminSessions: new AdminSessions(options.db),
  };
};
