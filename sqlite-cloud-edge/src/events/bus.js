import { randomUUID } from 'node:crypto';
import { sql } from '../db/client.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOffsetCollision(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('UNIQUE constraint failed: event_log.topic, event_log.partition_key, event_log.offset');
}

export async function publishEvent(topic, partitionKey, payload, eventVersion = 1) {
  if (String(process.env.DISABLE_EVENT_BUS || '').toLowerCase() === 'true') {
    return { eventId: 'disabled', topic, partitionKey, offset: 0 };
  }
  // Offset allocation can race under parallel backfill; retry on collisions.
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const now = Date.now();
    const eventId = randomUUID();
    const offsetRows = await sql(
      `SELECT COALESCE(MAX(offset), 0) AS max_offset
       FROM event_log
       WHERE topic = ? AND partition_key = ?`,
      topic,
      partitionKey
    );
    const nextOffset = Number(offsetRows?.[0]?.max_offset || 0) + 1;
    try {
      await sql(
        `INSERT INTO event_log(event_id, topic, partition_key, offset, event_version, payload_json, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
        eventId,
        topic,
        partitionKey,
        nextOffset,
        eventVersion,
        JSON.stringify(payload || {}),
        now
      );
      return { eventId, topic, partitionKey, offset: nextOffset };
    } catch (err) {
      if (!isOffsetCollision(err) || attempt === 8) throw err;
      await sleep(Math.min(40 * attempt, 300));
    }
  }
}

export async function consumeBatch(consumerGroup, topic, partitionKey, limit = 100) {
  const offsetRows = await sql(
    `SELECT last_offset
     FROM consumer_offsets
     WHERE consumer_group = ? AND topic = ? AND partition_key = ?`,
    consumerGroup,
    topic,
    partitionKey
  );
  const lastOffset = Number(offsetRows?.[0]?.last_offset || 0);
  const rows = await sql(
    `SELECT event_id, topic, partition_key, offset, event_version, payload_json, created_at
     FROM event_log
     WHERE topic = ? AND partition_key = ? AND offset > ?
     ORDER BY offset ASC
     LIMIT ?`,
    topic,
    partitionKey,
    lastOffset,
    limit
  );
  return rows || [];
}

export async function ackEvent(consumerGroup, topic, partitionKey, offset, eventId) {
  const now = Date.now();
  await sql(
    `INSERT OR REPLACE INTO consumer_offsets(consumer_group, topic, partition_key, last_offset, updated_at)
     VALUES(?, ?, ?, ?, ?)`,
    consumerGroup,
    topic,
    partitionKey,
    offset,
    now
  );
  await sql(
    `INSERT OR REPLACE INTO processed_events(consumer_group, event_id, processed_at)
     VALUES(?, ?, ?)`,
    consumerGroup,
    eventId,
    now
  );
}

export async function sendToDlq(sourceTopic, eventId, payload, errorMessage, attemptCount = 1) {
  await sql(
    `INSERT INTO dead_letters(id, source_topic, event_id, payload_json, error_message, attempt_count, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    sourceTopic,
    eventId,
    JSON.stringify(payload || {}),
    String(errorMessage || 'unknown error'),
    attemptCount,
    Date.now()
  );
}

