CREATE TABLE IF NOT EXISTS domain_entities (
  entity_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  object_type TEXT NOT NULL,
  source_protocol TEXT NOT NULL,
  score TEXT NOT NULL DEFAULT '0',
  amount_in TEXT NOT NULL DEFAULT '0',
  amount_out TEXT NOT NULL DEFAULT '0',
  count_in INTEGER NOT NULL DEFAULT 0,
  count_out INTEGER NOT NULL DEFAULT 0,
  identity_json TEXT NOT NULL DEFAULT '{}',
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_entity_dims (
  entity_id TEXT NOT NULL,
  dim_key TEXT NOT NULL,
  dim_value TEXT NOT NULL,
  PRIMARY KEY (entity_id, dim_key, dim_value),
  FOREIGN KEY (entity_id) REFERENCES domain_entities(entity_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_events (
  event_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  source_protocol TEXT NOT NULL,
  txid TEXT NOT NULL,
  block_height INTEGER,
  block_time INTEGER,
  direction TEXT,
  amount_text TEXT NOT NULL DEFAULT '0',
  payload_json TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_event_dims (
  event_id TEXT NOT NULL,
  dim_key TEXT NOT NULL,
  dim_value TEXT NOT NULL,
  PRIMARY KEY (event_id, dim_key, dim_value),
  FOREIGN KEY (event_id) REFERENCES domain_events(event_id) ON DELETE CASCADE
);

