-- Chain/query path indexes
CREATE INDEX IF NOT EXISTS idx_blocks_time_desc
  ON blocks(time DESC);

CREATE INDEX IF NOT EXISTS idx_blocks_height_desc_cover
  ON blocks(height DESC, hash, size, n_tx, time);

CREATE INDEX IF NOT EXISTS idx_transactions_block_height
  ON transactions(block_height);

CREATE INDEX IF NOT EXISTS idx_transactions_block_height_txid
  ON transactions(block_height, txid);

CREATE INDEX IF NOT EXISTS idx_transactions_block_time_desc
  ON transactions(block_time DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_block_hash
  ON transactions(block_hash);

CREATE INDEX IF NOT EXISTS idx_tx_inputs_prevout
  ON tx_inputs(prev_txid, prev_vout);

CREATE INDEX IF NOT EXISTS idx_tx_outputs_address
  ON tx_outputs(address);

CREATE INDEX IF NOT EXISTS idx_tx_outputs_opreturn
  ON tx_outputs(op_return_hex);

CREATE INDEX IF NOT EXISTS idx_addresses_address_height_desc
  ON addresses(address, block_height DESC);

CREATE INDEX IF NOT EXISTS idx_addresses_block_height
  ON addresses(block_height);

-- Protocol-agnostic event indexing
CREATE INDEX IF NOT EXISTS idx_protocol_events_protocol_height_desc
  ON protocol_events(protocol_id, block_height DESC);

CREATE INDEX IF NOT EXISTS idx_protocol_events_protocol_discovered_desc
  ON protocol_events(protocol_id, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_protocol_events_entity_lookup
  ON protocol_events(protocol_id, entity_type, entity_key, block_time DESC);

CREATE INDEX IF NOT EXISTS idx_protocol_events_txid_vout
  ON protocol_events(txid, vout);

-- Job orchestration indexes
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_next_run
  ON ingest_jobs(status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_kind_status
  ON ingest_jobs(kind, status);

-- Event-bus runtime indexes
CREATE INDEX IF NOT EXISTS idx_event_log_topic_created_desc
  ON event_log(topic, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_log_partition_created_desc
  ON event_log(partition_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consumer_offsets_updated_at
  ON consumer_offsets(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dead_letters_topic_created_desc
  ON dead_letters(source_topic, created_at DESC);

