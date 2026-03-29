import { randomUUID } from 'node:crypto';
import { sql } from '../db/client.js';
import { publishEvent } from '../events/bus.js';

export async function enqueueHydration(kind, payload) {
  const id = randomUUID();
  const now = Date.now();
  await sql(
    `INSERT INTO ingest_jobs(id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
     VALUES(?, ?, ?, 'queued', 0, ?, ?, ?)`,
    id,
    kind,
    JSON.stringify(payload || {}),
    now,
    now,
    now
  );
  await publishEvent('hydrate.requested', kind, { id, kind, payload });
  return id;
}

