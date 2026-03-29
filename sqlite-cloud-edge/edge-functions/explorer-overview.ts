const ADMIN_API_KEY = '__SQLITECLOUD_API_KEY__';
const CLOUD_HOSTNAME = '__SQLITECLOUD_PROJECT__';
const CLOUD_DATABASE = '__SQLITECLOUD_DATABASE__';

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
  const rows = await adminQuery(
    `SELECT height, hash, time, size, n_tx
     FROM blocks
     ORDER BY height DESC
     LIMIT 1`
  );
  const tip = rows[0] || null;
  return {
    ok: true,
    mininginfo: { blocks: Number(tip?.height || 0) },
    peerinfo: [],
    latestBlock: tip
  };
} catch (err: any) {
  return { ok: false, error: String(err?.message ?? err) };
}

