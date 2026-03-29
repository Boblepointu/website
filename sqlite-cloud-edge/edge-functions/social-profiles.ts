const ADMIN_API_KEY = '__SQLITECLOUD_API_KEY__';
const CLOUD_HOSTNAME = '__SQLITECLOUD_PROJECT__';
const CLOUD_DATABASE = '__SQLITECLOUD_DATABASE__';

function n(v: unknown, fallback: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

async function adminQuery(sql: string): Promise<any[]> {
  const auth = `Bearer sqlitecloud://${CLOUD_HOSTNAME}/${CLOUD_DATABASE}?apikey=${ADMIN_API_KEY}`;
  const res = await fetch(`https://${CLOUD_HOSTNAME}:443/v2/weblite/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: auth
    },
    body: JSON.stringify({ sql, database: CLOUD_DATABASE })
  });
  if (!res.ok) throw new Error(`Weblite ${res.status}`);
  const payload = await res.json() as { data?: any[]; error?: string };
  if (payload.error) throw new Error(payload.error);
  return Array.isArray(payload.data) ? payload.data : [];
}

try {
  const raw = (request.data ?? {}) as Record<string, unknown>;
  const page = Math.max(1, n(raw.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(raw.pageSize, 10)));
  const offset = (page - 1) * pageSize;

  const rows = await adminQuery(
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
     ORDER BY CAST(e.score AS INTEGER) DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );

  return {
    ok: true,
    profiles: rows,
    numPages: rows.length === pageSize ? page + 1 : page
  };
} catch (err: any) {
  return { ok: false, error: String(err?.message ?? err) };
}

