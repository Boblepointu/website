CREATE TABLE IF NOT EXISTS event_log (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  offset INTEGER NOT NULL,
  event_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_topic_partition_offset
  ON event_log(topic, partition_key, offset);

CREATE TABLE IF NOT EXISTS consumer_offsets (
  consumer_group TEXT NOT NULL,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  last_offset INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (consumer_group, topic, partition_key)
);

CREATE TABLE IF NOT EXISTS processed_events (
  consumer_group TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (consumer_group, event_id)
);

CREATE TABLE IF NOT EXISTS dead_letters (
  id TEXT PRIMARY KEY,
  source_topic TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error_message TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  requeued_at INTEGER
);

