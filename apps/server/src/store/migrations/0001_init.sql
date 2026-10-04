-- Corpus: one row per recorded exchange. Body chunks live in files under the
-- data directory; the row carries everything selection needs.
CREATE TABLE cassettes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  key_name TEXT,
  target_id TEXT,
  session_id TEXT,
  closed_at INTEGER,
  description TEXT
);

CREATE TABLE recordings (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  protocol TEXT NOT NULL,
  transport TEXT NOT NULL,
  model TEXT,
  status INTEGER NOT NULL,
  wire TEXT NOT NULL,
  outcome TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  prefix_hashes TEXT NOT NULL,
  features TEXT NOT NULL,
  session_id TEXT,
  cassette_id TEXT REFERENCES cassettes(id) ON DELETE SET NULL,
  cassette_seq INTEGER,
  request TEXT NOT NULL,
  response_meta TEXT NOT NULL,
  chunk_file TEXT NOT NULL,
  body_bytes INTEGER NOT NULL
);

CREATE INDEX recordings_by_protocol ON recordings (protocol, created_at);
CREATE INDEX recordings_by_fingerprint ON recordings (fingerprint);
CREATE INDEX recordings_by_cassette ON recordings (cassette_id, cassette_seq);

-- Configuration: upstream targets, scenarios and mock key bindings.
CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  headers TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE scenarios (
  name TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE api_keys (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('record', 'replay')),
  target_id TEXT,
  scenario TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
