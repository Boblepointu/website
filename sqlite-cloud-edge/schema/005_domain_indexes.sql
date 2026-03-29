CREATE INDEX IF NOT EXISTS idx_domain_entities_lookup
  ON domain_entities(domain, object_type, source_protocol);

CREATE INDEX IF NOT EXISTS idx_domain_entities_rank_desc
  ON domain_entities(domain, object_type, source_protocol, CAST(score AS INTEGER) DESC);

CREATE INDEX IF NOT EXISTS idx_domain_entity_dims_lookup
  ON domain_entity_dims(dim_key, dim_value, entity_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain_time_desc
  ON domain_events(domain, block_time DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain_activity_time_desc
  ON domain_events(domain, activity_type, block_time DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_protocol_time_desc
  ON domain_events(source_protocol, block_time DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_txid
  ON domain_events(txid);

CREATE INDEX IF NOT EXISTS idx_domain_event_dims_lookup
  ON domain_event_dims(dim_key, dim_value, event_id);

