CREATE INDEX IF NOT EXISTS idx_chain_stats_height_ts_desc
  ON chain_stats_snapshots(block_height DESC, snapshot_ts DESC);

CREATE INDEX IF NOT EXISTS idx_chain_stats_ts_desc
  ON chain_stats_snapshots(snapshot_ts DESC);

CREATE INDEX IF NOT EXISTS idx_chain_stats_ts_desc_cover
  ON chain_stats_snapshots(snapshot_ts DESC, block_height, hashrate, difficulty, mempool_count);

CREATE INDEX IF NOT EXISTS idx_supply_stats_day_desc
  ON supply_stats_daily(day_ts DESC);

CREATE INDEX IF NOT EXISTS idx_address_balances_balance_desc
  ON address_balances(balance_sats DESC, address);

CREATE INDEX IF NOT EXISTS idx_address_received_received_desc
  ON address_received(received_sats DESC, address);

CREATE INDEX IF NOT EXISTS idx_richlist_snapshots_kind_rank
  ON richlist_snapshots(snapshot_id, kind, rank);

CREATE INDEX IF NOT EXISTS idx_peer_snapshots_captured_desc
  ON peer_snapshots(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_mempool_snapshots_ts_desc
  ON mempool_snapshots(snapshot_ts DESC);
