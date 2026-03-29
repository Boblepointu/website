// @ts-nocheck
const ADMIN_API_KEY = '__SQLITECLOUD_API_KEY__';
const CLOUD_HOSTNAME = '__SQLITECLOUD_PROJECT__';
const CLOUD_DATABASE = '__SQLITECLOUD_DATABASE__';
const FALLBACK_EXPLORER_BASE = '__FALLBACK_EXPLORER_API_BASE__';
const FALLBACK_SOCIAL_BASE = '__FALLBACK_SOCIAL_API_BASE__';
const ENABLE_SOCIAL_FALLBACK = false;

function esc(v: string | number | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
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
  const payload = (await res.json()) as { data?: any[]; error?: string };
  if (payload.error) throw new Error(payload.error);
  return Array.isArray(payload.data) ? payload.data : [];
}

async function enqueueHydration(pathname: string, query: Record<string, unknown>) {
  const now = Date.now();
  const id = `job_${now}_${Math.random().toString(36).slice(2, 10)}`;
  await adminQuery(
    `INSERT INTO ingest_jobs(id, kind, payload_json, status, attempts, next_run_at, created_at, updated_at)
     VALUES(${esc(id)}, 'hydrate_api', ${esc(JSON.stringify({ pathname, query }))}, 'queued', 0, ${now}, ${now}, ${now})`
  );
}

function buildUrl(base: string, pathname: string, query?: Record<string, unknown>): string {
  const u = new URL(pathname, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && String(v) !== '') u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function fallback(pathname: string, query: Record<string, unknown>, social = false): Promise<any> {
  if (social && !ENABLE_SOCIAL_FALLBACK) {
    throw new Error('social fallback disabled');
  }
  const base = social ? FALLBACK_SOCIAL_BASE : FALLBACK_EXPLORER_BASE;
  const res = await fetch(buildUrl(base, pathname, query), { redirect: 'follow' });
  if (!res.ok) throw new Error(`Fallback ${pathname} failed ${res.status}`);
  return res.json();
}

async function explorerOverview(): Promise<any | null> {
  const rows = await adminQuery(`SELECT height, hash, time, size, n_tx FROM blocks ORDER BY height DESC LIMIT 1`);
  if (!rows.length) return null;
  const tip = rows[0];
  return { mininginfo: { blocks: n(tip.height) }, peerinfo: [], latestBlock: tip };
}

async function explorerBlocks(query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT height, hash, time, size, n_tx FROM blocks ORDER BY height DESC LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  const tipRows = await adminQuery(`SELECT MAX(height) AS tipHeight FROM blocks`);
  const tipHeight = n(tipRows?.[0]?.tipHeight, 0);
  const blocks = rows.map((r) => ({
    blockInfo: {
      height: n(r.height),
      hash: String(r.hash || ''),
      blockSize: n(r.size),
      numTxs: n(r.n_tx),
      timestamp: n(r.time),
      numBurnedSats: 0
    }
  }));
  return { blocks, page, pageSize, tipHeight };
}

async function explorerBlockDetail(hashOrHeight: string): Promise<any | null> {
  const isNum = /^[0-9]+$/.test(hashOrHeight);
  const where = isNum ? `height = ${n(hashOrHeight)}` : `hash = ${esc(hashOrHeight)}`;
  const rows = await adminQuery(`SELECT height, hash, time, size, n_tx FROM blocks WHERE ${where} LIMIT 1`);
  if (!rows.length) return null;
  const block = rows[0];
  const txRows = await adminQuery(
    `SELECT txid, block_time, size, raw_json
     FROM transactions
     WHERE block_height = ${n(block.height)}
     ORDER BY txid ASC`
  );
  const txs = txRows.map((t) => {
    const raw = asObj(t.raw_json ? JSON.parse(String(t.raw_json)) : {});
    const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
    const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
    return {
      txid: String(t.txid || ''),
      timeFirstSeen: n(t.block_time),
      size: n(t.size),
      inputs,
      outputs,
      sumBurnedSats: 0,
      isCoinbase: inputs.some((i) => asObj(i).coinbase)
    };
  });
  return {
    blockInfo: {
      height: n(block.height),
      hash: String(block.hash || ''),
      timestamp: n(block.time),
      blockSize: n(block.size),
      numTxs: n(block.n_tx),
      reward: 0,
      numBurnedSats: 0
    },
    txs,
    minedBy: ''
  };
}

async function explorerTxDetail(txid: string): Promise<any | null> {
  const txRows = await adminQuery(
    `SELECT txid, block_height, block_hash, block_time, size, raw_json
     FROM transactions WHERE txid = ${esc(txid)} LIMIT 1`
  );
  if (!txRows.length) return null;
  const t = txRows[0];
  const inRows = await adminQuery(
    `SELECT i.coinbase_hex, i.prev_txid, i.prev_vout, o.value_sats AS prev_value
     FROM tx_inputs i
     LEFT JOIN tx_outputs o ON o.txid = i.prev_txid AND o.vout = i.prev_vout
     WHERE i.txid = ${esc(txid)}
     ORDER BY i.vin ASC`
  );
  const outRows = await adminQuery(
    `SELECT address, value_sats, op_return_hex FROM tx_outputs WHERE txid = ${esc(txid)} ORDER BY vout ASC`
  );
  const inputs = inRows.map((i) => ({
    address: i.coinbase_hex ? '' : '-',
    value: i.coinbase_hex ? null : n(i.prev_value),
    isCoinbase: Boolean(i.coinbase_hex)
  }));
  const outputs = outRows.map((o) => ({
    address: o.address || '',
    value: n(o.value_sats),
    rankOutput: String(o.op_return_hex || '').toUpperCase().includes('52414E4B') ? {} : null
  }));
  return {
    txid: String(t.txid || txid),
    timeFirstSeen: n(t.block_time),
    size: n(t.size),
    confirmations: 1,
    isCoinbase: inputs.some((i) => i.isCoinbase),
    block: {
      hash: String(t.block_hash || ''),
      timestamp: n(t.block_time)
    },
    inputs,
    outputs
  };
}

async function explorerAddress(address: string, query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const countRows = await adminQuery(`SELECT COUNT(DISTINCT txid) AS c FROM tx_outputs WHERE address = ${esc(address)}`);
  const total = n(countRows?.[0]?.c, 0);
  if (total <= 0) return null;
  const rows = await adminQuery(
    `SELECT t.txid, t.block_time, t.size, t.block_hash
     FROM transactions t
     INNER JOIN tx_outputs o ON o.txid = t.txid
     WHERE o.address = ${esc(address)}
     GROUP BY t.txid
     ORDER BY t.block_time DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  const txs = rows.map((r) => ({
    txid: String(r.txid || ''),
    timeFirstSeen: n(r.block_time),
    size: n(r.size),
    sumBurnedSats: 0,
    inputs: [],
    outputs: [],
    block: { hash: String(r.block_hash || ''), timestamp: n(r.block_time) }
  }));
  const lastSeen = txs.length ? txs[0].timeFirstSeen : 0;
  return {
    history: { txs, numPages: Math.max(1, Math.ceil(total / pageSize)) },
    lastSeen
  };
}

async function explorerAddressBalance(address: string): Promise<any | null> {
  const rows = await adminQuery(
    `SELECT COALESCE(balance_sats,0) AS balance
     FROM address_balances
     WHERE address = ${esc(address)}
     LIMIT 1`
  );
  if (!rows.length) return null;
  return n(rows[0].balance, 0);
}

function statsPeriodConfig(period: unknown): { key: string; points: number } {
  const p = String(period || 'day');
  if (p === 'week') return { key: 'week', points: 7 * 24 };
  if (p === 'month') return { key: 'month', points: 31 * 24 };
  if (p === 'quarter') return { key: 'quarter', points: 90 * 24 };
  if (p === 'year') return { key: 'year', points: 365 };
  return { key: 'day', points: 24 * 12 };
}

async function explorerStatsCards(): Promise<any | null> {
  const tipRows = await adminQuery(`SELECT MAX(height) AS tipHeight FROM blocks`);
  if (!tipRows.length) return null;
  const statRows = await adminQuery(
    `SELECT hashrate, difficulty, mempool_count, mempool_bytes
     FROM chain_stats_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT 1`
  );
  const supplyRows = await adminQuery(
    `SELECT total_supply_sats, burned_sats, inflation_bps
     FROM supply_stats_daily
     ORDER BY day_ts DESC
     LIMIT 1`
  );
  return {
    tipHeight: n(tipRows?.[0]?.tipHeight, 0),
    hashrate: Number(statRows?.[0]?.hashrate || 0),
    difficulty: Number(statRows?.[0]?.difficulty || 0),
    mempoolCount: n(statRows?.[0]?.mempool_count, 0),
    mempoolBytes: n(statRows?.[0]?.mempool_bytes, 0),
    totalSupplySats: n(supplyRows?.[0]?.total_supply_sats, 0),
    burnedSupplySats: n(supplyRows?.[0]?.burned_sats, 0),
    inflationPct: Number(n(supplyRows?.[0]?.inflation_bps, 0) / 100)
  };
}

async function explorerMempool(query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT txid, block_time, size
     FROM transactions
     WHERE block_height IS NULL OR block_height = 0
     ORDER BY block_time DESC, txid DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  return rows.map((r) => ({
    txid: String(r.txid || ''),
    timeFirstSeen: n(r.block_time, 0),
    size: n(r.size, 0)
  }));
}

async function explorerMempoolStats(): Promise<any | null> {
  const rows = await adminQuery(
    `SELECT snapshot_ts, tx_count, total_bytes
     FROM mempool_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT 1`
  );
  return {
    txCount: n(rows?.[0]?.tx_count, 0),
    totalBytes: n(rows?.[0]?.total_bytes, 0),
    snapshotTs: n(rows?.[0]?.snapshot_ts, 0)
  };
}

async function explorerMempoolHistory(query: Record<string, unknown>): Promise<any | null> {
  const conf = statsPeriodConfig(query.period);
  const rows = await adminQuery(
    `SELECT snapshot_ts, tx_count, total_bytes
     FROM mempool_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT ${conf.points}`
  );
  return {
    period: conf.key,
    series: rows.slice().reverse().map((r) => ({
      ts: n(r.snapshot_ts, 0),
      txCount: n(r.tx_count, 0),
      totalBytes: n(r.total_bytes, 0)
    }))
  };
}

async function explorerStatsCharts(query: Record<string, unknown>): Promise<any | null> {
  const conf = statsPeriodConfig(query.period);
  const rows = await adminQuery(
    `SELECT snapshot_ts, block_height, hashrate, difficulty, mempool_count
     FROM chain_stats_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT ${conf.points}`
  );
  if (!rows.length) return null;
  return {
    period: conf.key,
    series: rows.slice().reverse().map((r) => ({
      ts: n(r.snapshot_ts, 0),
      blockHeight: n(r.block_height, 0),
      hashrate: Number(r.hashrate || 0),
      difficulty: Number(r.difficulty || 0),
      mempoolCount: n(r.mempool_count, 0)
    }))
  };
}

async function explorerRichlistBalance(query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const totalRows = await adminQuery(`SELECT COALESCE(SUM(balance_sats), 0) AS total FROM address_balances`);
  const total = n(totalRows?.[0]?.total, 0);
  const rows = await adminQuery(
    `SELECT address, balance_sats
     FROM address_balances
     ORDER BY balance_sats DESC, address ASC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  return {
    page,
    pageSize,
    rows: rows.map((r, idx) => ({
      rank: offset + idx + 1,
      address: String(r.address || ''),
      balanceSats: n(r.balance_sats, 0),
      balanceXpi: Number(n(r.balance_sats, 0) / 1000000),
      pct: total > 0 ? Number((n(r.balance_sats, 0) / total) * 100) : 0
    }))
  };
}

async function explorerRichlistReceived(query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT address, received_sats
     FROM address_received
     ORDER BY received_sats DESC, address ASC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  return {
    page,
    pageSize,
    rows: rows.map((r, idx) => ({
      rank: offset + idx + 1,
      address: String(r.address || ''),
      receivedSats: n(r.received_sats, 0),
      receivedXpi: Number(n(r.received_sats, 0) / 1000000)
    }))
  };
}

async function explorerRichlistWealth(): Promise<any | null> {
  const rows = await adminQuery(
    `SELECT
       CASE
         WHEN balance_sats >= 1000000000000 THEN '>=1M XPI'
         WHEN balance_sats >= 100000000000 THEN '100k-1M XPI'
         WHEN balance_sats >= 10000000000 THEN '10k-100k XPI'
         WHEN balance_sats >= 1000000000 THEN '1k-10k XPI'
         WHEN balance_sats >= 100000000 THEN '100-1k XPI'
         ELSE '<100 XPI'
       END AS label,
       COUNT(*) AS holder_count,
       COALESCE(SUM(balance_sats), 0) AS total_sats
     FROM address_balances
     GROUP BY label
     ORDER BY total_sats DESC`
  );
  if (!rows.length) return null;
  const totalRows = await adminQuery(`SELECT COALESCE(SUM(balance_sats), 0) AS total FROM address_balances`);
  const total = n(totalRows?.[0]?.total, 0);
  return {
    buckets: rows.map((r) => ({
      label: String(r.label || ''),
      count: n(r.holder_count, 0),
      totalSats: n(r.total_sats, 0),
      pct: total > 0 ? Number((n(r.total_sats, 0) / total) * 100) : 0
    }))
  };
}

async function explorerNetworkPeers(): Promise<any | null> {
  const capRows = await adminQuery(`SELECT MAX(captured_at) AS ts FROM peer_snapshots`);
  const cap = n(capRows?.[0]?.ts, 0);
  if (!cap) return null;
  const rows = await adminQuery(
    `SELECT address, subver, protocol_version, synced_blocks, country_code, country_name, captured_at, addnode_line, onetry_line
     FROM peer_snapshots
     WHERE captured_at = ${cap}
     ORDER BY address ASC`
  );
  return {
    capturedAt: cap,
    peers: rows.map((r) => ({
      address: String(r.address || ''),
      subver: String(r.subver || ''),
      protocolVersion: n(r.protocol_version, 0),
      syncedBlocks: n(r.synced_blocks, 0),
      countryCode: String(r.country_code || ''),
      countryName: String(r.country_name || ''),
      lastSeen: n(r.captured_at, 0),
      addnodeLine: String(r.addnode_line || ''),
      onetryLine: String(r.onetry_line || '')
    }))
  };
}

async function explorerNetworkNodes(): Promise<any | null> {
  const peers = await explorerNetworkPeers();
  if (!peers || !Array.isArray(peers.peers) || !peers.peers.length) return null;
  const addnode: string[] = [];
  const onetry: string[] = [];
  for (const p of peers.peers) {
    const host = String(p.address || '');
    if (!host) continue;
    addnode.push(p.addnodeLine || `addnode=${host}`);
    onetry.push(p.onetryLine || `onetry=${host}`);
  }
  return { addnode, onetry };
}

async function socialProfiles(query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT p.dim_value AS platform, r.dim_value AS id, e.score AS ranking, e.count_in AS votesPositive, e.count_out AS votesNegative
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key = 'platform'
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key = 'profile_id'
     WHERE e.domain = 'social' AND e.object_type = 'profile'
     ORDER BY CAST(e.score AS INTEGER) DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  const count = await adminQuery(`SELECT COUNT(*) AS c FROM domain_entities WHERE domain='social' AND object_type='profile'`);
  const total = n(count?.[0]?.c, rows.length);
  return { profiles: rows, numPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function socialActivity(query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT e.txid, e.block_time AS firstSeen, e.amount_text AS sats, e.direction,
            p.dim_value AS platform, r.dim_value AS profileId, COALESCE(po.dim_value, '') AS postId
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id = e.event_id AND p.dim_key = 'platform'
     JOIN domain_event_dims r ON r.event_id = e.event_id AND r.dim_key = 'profile_id'
     LEFT JOIN domain_event_dims po ON po.event_id = e.event_id AND po.dim_key = 'post_id'
     WHERE e.domain='social' AND e.activity_type='vote'
     ORDER BY e.block_time DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  const votes = rows.map((v) => ({
    txid: v.txid,
    firstSeen: n(v.firstSeen),
    platform: v.platform,
    profileId: v.profileId,
    postId: v.postId,
    sats: v.sats,
    sentiment: v.direction === 'in' ? 'positive' : v.direction === 'out' ? 'negative' : 'neutral'
  }));
  const count = await adminQuery(`SELECT COUNT(*) AS c FROM domain_events WHERE domain='social' AND activity_type='vote'`);
  const total = n(count?.[0]?.c, votes.length);
  return { votes, numPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function socialProfile(platform: string, profileId: string): Promise<any | null> {
  const rows = await adminQuery(
    `SELECT e.score AS ranking, e.count_in AS votesPositive, e.count_out AS votesNegative
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key = 'platform' AND p.dim_value = ${esc(platform)}
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key = 'profile_id' AND r.dim_value = ${esc(profileId)}
     WHERE e.domain='social' AND e.object_type='profile'
     LIMIT 1`
  );
  if (!rows.length) return null;
  return { platform, id: profileId, ...rows[0] };
}

async function socialPosts(platform: string, profileId: string, query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT po.dim_value AS id, e.score AS ranking, e.count_in AS votesPositive, e.count_out AS votesNegative
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key = 'platform' AND p.dim_value = ${esc(platform)}
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key = 'profile_id' AND r.dim_value = ${esc(profileId)}
     JOIN domain_entity_dims po ON po.entity_id = e.entity_id AND po.dim_key = 'post_id'
     WHERE e.domain='social' AND e.object_type='post'
     ORDER BY CAST(e.score AS INTEGER) DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  const c = await adminQuery(
    `SELECT COUNT(*) AS c
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key='platform' AND p.dim_value=${esc(platform)}
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key='profile_id' AND r.dim_value=${esc(profileId)}
     WHERE e.domain='social' AND e.object_type='post'`
  );
  return { posts: rows, numPages: Math.max(1, Math.ceil(n(c?.[0]?.c, rows.length) / pageSize)) };
}

async function socialVotes(platform: string, profileId: string, query: Record<string, unknown>): Promise<any | null> {
  const page = Math.max(1, n(query.page, 1));
  const pageSize = Math.max(1, Math.min(100, n(query.pageSize, 10)));
  const offset = (page - 1) * pageSize;
  const rows = await adminQuery(
    `SELECT e.txid, e.block_time AS timestamp, e.amount_text AS sats, e.direction, COALESCE(po.dim_value,'') AS postId
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id=e.event_id AND p.dim_key='platform' AND p.dim_value=${esc(platform)}
     JOIN domain_event_dims r ON r.event_id=e.event_id AND r.dim_key='profile_id' AND r.dim_value=${esc(profileId)}
     LEFT JOIN domain_event_dims po ON po.event_id=e.event_id AND po.dim_key='post_id'
     WHERE e.domain='social' AND e.activity_type='vote'
     ORDER BY e.block_time DESC
     LIMIT ${pageSize} OFFSET ${offset}`
  );
  if (!rows.length) return null;
  const votes = rows.map((v) => ({
    txid: v.txid,
    timestamp: n(v.timestamp),
    sats: v.sats,
    sentiment: v.direction === 'in' ? 'positive' : v.direction === 'out' ? 'negative' : 'neutral',
    post: { id: v.postId, ranking: '0' }
  }));
  const c = await adminQuery(
    `SELECT COUNT(*) AS c
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id=e.event_id AND p.dim_key='platform' AND p.dim_value=${esc(platform)}
     JOIN domain_event_dims r ON r.event_id=e.event_id AND r.dim_key='profile_id' AND r.dim_value=${esc(profileId)}
     WHERE e.domain='social' AND e.activity_type='vote'`
  );
  return { votes, numPages: Math.max(1, Math.ceil(n(c?.[0]?.c, votes.length) / pageSize)) };
}

async function socialStats(kind: 'profiles' | 'posts', dir: 'top' | 'low'): Promise<any | null> {
  const objectType = kind === 'profiles' ? 'profile' : 'post';
  const order = dir === 'top' ? 'DESC' : 'ASC';
  const rows = await adminQuery(
    `SELECT p.dim_value AS platform, r.dim_value AS profileId, COALESCE(po.dim_value,'') AS postId, e.score AS ranking
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id=e.entity_id AND p.dim_key='platform'
     JOIN domain_entity_dims r ON r.entity_id=e.entity_id AND r.dim_key='profile_id'
     LEFT JOIN domain_entity_dims po ON po.entity_id=e.entity_id AND po.dim_key='post_id'
     WHERE e.domain='social' AND e.object_type=${esc(objectType)}
     ORDER BY CAST(e.score AS INTEGER) ${order}
     LIMIT 10`
  );
  if (!rows.length) return null;
  return rows;
}

async function handleDb(pathname: string, query: Record<string, unknown>): Promise<any | null> {
  if (pathname === '/api/explorer/overview') return explorerOverview();
  if (pathname === '/api/explorer/chain-info') return explorerOverview().then((o) => ({ tipHeight: n(o?.mininginfo?.blocks, 0) }));
  if (pathname === '/api/explorer/mempool') return explorerMempool(query);
  if (pathname === '/api/explorer/mempool/stats') return explorerMempoolStats();
  if (pathname === '/api/explorer/mempool/history') return explorerMempoolHistory(query);
  if (pathname === '/api/explorer/blocks') return explorerBlocks(query);
  if (pathname === '/api/explorer/stats/cards') return explorerStatsCards();
  if (pathname === '/api/explorer/stats/charts') return explorerStatsCharts(query);
  if (pathname === '/api/explorer/richlist/balance') return explorerRichlistBalance(query);
  if (pathname === '/api/explorer/richlist/received') return explorerRichlistReceived(query);
  if (pathname === '/api/explorer/richlist/wealth') return explorerRichlistWealth();
  if (pathname === '/api/explorer/network/peers') return explorerNetworkPeers();
  if (pathname === '/api/explorer/network/nodes') return explorerNetworkNodes();
  const blockMatch = pathname.match(/^\/api\/explorer\/block\/([^/]+)$/);
  if (blockMatch) return explorerBlockDetail(decodeURIComponent(blockMatch[1]));
  const txMatch = pathname.match(/^\/api\/explorer\/tx\/([^/]+)$/);
  if (txMatch) return explorerTxDetail(decodeURIComponent(txMatch[1]));
  const addrBalMatch = pathname.match(/^\/api\/explorer\/address\/([^/]+)\/balance$/);
  if (addrBalMatch) return explorerAddressBalance(decodeURIComponent(addrBalMatch[1]));
  const addrMatch = pathname.match(/^\/api\/explorer\/address\/([^/]+)$/);
  if (addrMatch) return explorerAddress(decodeURIComponent(addrMatch[1]), query);

  if (pathname === '/api/social/activity') return socialActivity(query);
  if (pathname === '/api/social/profiles') return socialProfiles(query);
  if (pathname === '/api/social/stats/profiles/top-ranked/today') return socialStats('profiles', 'top');
  if (pathname === '/api/social/stats/profiles/lowest-ranked/today') return socialStats('profiles', 'low');
  if (pathname === '/api/social/stats/posts/top-ranked/today') return socialStats('posts', 'top');
  if (pathname === '/api/social/stats/posts/lowest-ranked/today') return socialStats('posts', 'low');
  const socialPostsMatch = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)\/posts$/);
  if (socialPostsMatch) return socialPosts(decodeURIComponent(socialPostsMatch[1]), decodeURIComponent(socialPostsMatch[2]), query);
  const socialVotesMatch = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)\/votes$/);
  if (socialVotesMatch) return socialVotes(decodeURIComponent(socialVotesMatch[1]), decodeURIComponent(socialVotesMatch[2]), query);
  const socialProfileMatch = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)$/);
  if (socialProfileMatch) return socialProfile(decodeURIComponent(socialProfileMatch[1]), decodeURIComponent(socialProfileMatch[2]));
  return null;
}

try {
  const raw = asObj(request.data);
  const pathname = String(raw.pathname || '');
  const query = asObj(raw.query || {});
  if (!pathname.startsWith('/api/')) return { ok: false, error: 'unsupported_path' };

  const isExplorer = pathname.startsWith('/api/explorer/');
  const isSocial = pathname.startsWith('/api/social/');
  let data: any = null;
  try {
    data = await handleDb(pathname, query);
  } catch (_) {
    data = null;
  }
  if (data === null || (Array.isArray(data) && data.length === 0)) {
    await enqueueHydration(pathname, query).catch(() => {});
    if (isExplorer) {
      if (pathname === '/api/explorer/stats/charts') data = { period: String(query.period || 'day'), series: [] };
      else if (pathname === '/api/explorer/mempool') data = [];
      else if (pathname === '/api/explorer/mempool/stats') data = { txCount: 0, totalBytes: 0, snapshotTs: 0 };
      else if (pathname === '/api/explorer/mempool/history') data = { period: String(query.period || 'day'), series: [] };
      else if (pathname === '/api/explorer/richlist/wealth') data = { buckets: [] };
      else if (pathname === '/api/explorer/richlist/balance' || pathname === '/api/explorer/richlist/received') data = { page: n(query.page, 1), pageSize: n(query.pageSize, 10), rows: [] };
      else if (pathname === '/api/explorer/network/peers') data = { capturedAt: 0, peers: [] };
      else if (pathname === '/api/explorer/network/nodes') data = { addnode: [], onetry: [] };
      return { ok: true, data };
    }
    if (isSocial && !ENABLE_SOCIAL_FALLBACK) {
      if (pathname.includes('/stats/')) data = [];
      else if (pathname.endsWith('/profiles')) data = { profiles: [], numPages: 1 };
      else if (pathname.endsWith('/activity')) data = { votes: [], numPages: 1 };
      else if (pathname.endsWith('/posts')) data = { posts: [], numPages: 1 };
      else if (pathname.endsWith('/votes')) data = { votes: [], numPages: 1 };
      else data = null;
      return { ok: true, data };
    }
    try {
      data = await fallback(pathname, query, isSocial);
    } catch (err) {
      if (pathname.includes('/stats/')) data = [];
      else throw err;
    }
  }
  return { ok: true, data };
} catch (err: any) {
  return { ok: false, error: String(err?.message ?? err) };
}

