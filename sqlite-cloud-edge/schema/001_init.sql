CREATE TABLE IF NOT EXISTS blocks (
  height INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  prev_hash TEXT,
  time INTEGER NOT NULL,
  size INTEGER NOT NULL,
  n_tx INTEGER NOT NULL,
  difficulty TEXT,
  raw_json TEXT NOT NULL,
  indexed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  txid TEXT PRIMARY KEY,
  block_height INTEGER,
  block_hash TEXT,
  block_time INTEGER,
  size INTEGER,
  locktime INTEGER,
  version INTEGER,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (block_height) REFERENCES blocks(height)
);

CREATE TABLE IF NOT EXISTS tx_inputs (
  txid TEXT NOT NULL,
  vin INTEGER NOT NULL,
  prev_txid TEXT,
  prev_vout INTEGER,
  coinbase_hex TEXT,
  sequence INTEGER,
  script_sig TEXT,
  PRIMARY KEY (txid, vin),
  FOREIGN KEY (txid) REFERENCES transactions(txid)
);

CREATE TABLE IF NOT EXISTS tx_outputs (
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  value_sats INTEGER NOT NULL,
  script_hex TEXT,
  script_type TEXT,
  address TEXT,
  op_return_hex TEXT,
  PRIMARY KEY (txid, vout),
  FOREIGN KEY (txid) REFERENCES transactions(txid)
);

CREATE TABLE IF NOT EXISTS addresses (
  address TEXT NOT NULL,
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  value_sats INTEGER NOT NULL,
  block_height INTEGER,
  block_time INTEGER,
  direction TEXT NOT NULL DEFAULT 'in',
  PRIMARY KEY (address, txid, vout)
);

CREATE TABLE IF NOT EXISTS protocol_registry (
  protocol_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  version TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS protocol_events (
  event_key TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL,
  protocol_version TEXT,
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  block_height INTEGER,
  block_time INTEGER,
  entity_type TEXT,
  entity_key TEXT,
  op_return_hex TEXT,
  payload_json TEXT NOT NULL,
  valid INTEGER NOT NULL DEFAULT 0,
  discovered_at INTEGER NOT NULL,
  FOREIGN KEY (protocol_id) REFERENCES protocol_registry(protocol_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO protocol_registry(protocol_id, display_name, version, enabled, created_at, updated_at)
VALUES('rank', 'RANK Protocol', 'v1', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

