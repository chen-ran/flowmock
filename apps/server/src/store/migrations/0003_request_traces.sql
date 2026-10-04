CREATE TABLE request_traces (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  key_name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  status INTEGER,
  outcome TEXT,
  recording_id TEXT,
  entry TEXT NOT NULL
);
CREATE INDEX request_traces_by_time ON request_traces (started_at DESC, id DESC);
