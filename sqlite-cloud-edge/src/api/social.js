import { sql } from '../db/client.js';
import { enqueueHydration } from '../ingest/read-through.js';

export async function getSocialProfiles(page = 1, pageSize = 10) {
  const p = Math.max(1, Number(page || 1));
  const ps = Math.max(1, Math.min(100, Number(pageSize || 10)));
  const offset = (p - 1) * ps;
  const rows = await sql(
    `SELECT
       p.dim_value AS platform,
       r.dim_value AS id,
       e.score AS ranking,
       e.amount_in AS sats_positive,
       e.amount_out AS sats_negative,
       e.count_in AS votes_positive,
       e.count_out AS votes_negative,
       e.source_protocol
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key = 'platform'
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key = 'profile_id'
     WHERE e.domain = 'social' AND e.object_type = 'profile'
     ORDER BY CAST(e.score AS REAL) DESC
     LIMIT ? OFFSET ?`,
    ps,
    offset
  );
  if (!rows?.length) {
    await enqueueHydration('social_profiles', { page: p, pageSize: ps });
  }
  return {
    profiles: rows || [],
    numPages: rows && rows.length === ps ? p + 1 : p
  };
}

export async function getSocialActivity(page = 1, pageSize = 10) {
  const p = Math.max(1, Number(page || 1));
  const ps = Math.max(1, Math.min(100, Number(pageSize || 10)));
  const offset = (p - 1) * ps;
  const rows = await sql(
    `SELECT
       e.txid,
       p.dim_value AS platform,
       r.dim_value AS profile_id,
       COALESCE(po.dim_value, '') AS post_id,
       e.direction AS sentiment,
       e.amount_text AS sats,
       e.block_time AS timestamp,
       e.source_protocol AS protocol_id
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id = e.event_id AND p.dim_key = 'platform'
     JOIN domain_event_dims r ON r.event_id = e.event_id AND r.dim_key = 'profile_id'
     LEFT JOIN domain_event_dims po ON po.event_id = e.event_id AND po.dim_key = 'post_id'
     WHERE e.domain = 'social' AND e.activity_type = 'vote'
     ORDER BY e.block_time DESC
     LIMIT ? OFFSET ?`,
    ps,
    offset
  );
  if (!rows?.length) {
    await enqueueHydration('social_activity', { page: p, pageSize: ps });
  }
  return {
    votes: rows || [],
    numPages: rows && rows.length === ps ? p + 1 : p
  };
}

