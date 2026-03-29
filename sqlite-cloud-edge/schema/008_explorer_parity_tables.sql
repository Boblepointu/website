CREATE TABLE IF NOT EXISTS chain_stats_snapshots (
  snapshot_ts INTEGER PRIMARY KEY,
  block_height INTEGER,
  block_hash TEXT,
  hashrate REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  mempool_count INTEGER NOT NULL DEFAULT 0,
  mempool_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supply_stats_daily (
  day_ts INTEGER PRIMARY KEY,
  issued_sats INTEGER NOT NULL DEFAULT 0,
  burned_sats INTEGER NOT NULL DEFAULT 0,
  total_supply_sats INTEGER NOT NULL DEFAULT 0,
  circulating_sats INTEGER NOT NULL DEFAULT 0,
  inflation_bps INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS address_balances (
  address TEXT PRIMARY KEY,
  balance_sats INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS address_received (
  address TEXT PRIMARY KEY,
  received_sats INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS richlist_snapshots (
  snapshot_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  rank INTEGER NOT NULL,
  address TEXT NOT NULL,
  value_sats INTEGER NOT NULL DEFAULT 0,
  pct REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, kind, rank)
);

CREATE TABLE IF NOT EXISTS peer_snapshots (
  peer_id TEXT PRIMARY KEY,
  captured_at INTEGER NOT NULL,
  address TEXT NOT NULL,
  subver TEXT,
  protocol_version INTEGER,
  synced_blocks INTEGER,
  country_code TEXT,
  country_name TEXT,
  addnode_line TEXT,
  onetry_line TEXT
);

CREATE TABLE IF NOT EXISTS mempool_snapshots (
  snapshot_ts INTEGER PRIMARY KEY,
  tx_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
