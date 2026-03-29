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
    `SELECT height, hash, size, n_tx, time
     FROM blocks
     ORDER BY height DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );

  return {
    ok: true,
    page,
    pageSize,
    hasMore: rows.length === pageSize,
    blocks: rows
  };
} catch (err: any) {
  return { ok: false, error: String(err?.message ?? err) };
}

