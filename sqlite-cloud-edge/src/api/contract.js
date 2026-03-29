import { sql } from '../db/client.js';
import { enqueueHydration } from '../ingest/read-through.js';
import { config } from '../config.js';

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pageAndSize(searchParams) {
  const page = Math.max(1, toInt(searchParams.get('page'), 1));
  const pageSize = Math.max(1, Math.min(100, toInt(searchParams.get('pageSize'), 10)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

async function fallbackApi(pathname, searchParams, social = false) {
  if (social) {
    if (!config.enableSocialFallback || !config.fallbackSocialApiBase) {
      throw new Error('social fallback disabled');
    }
  }
  const base = social
    ? config.fallbackSocialApiBase
    : (config.fallbackExplorerApiBase || 'https://explorer.lotusia.org');
  const u = new URL(pathname, base);
  for (const [k, v] of searchParams.entries()) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { redirect: 'follow' });
  if (!res.ok) throw new Error(`fallback ${pathname} failed ${res.status}`);
  return res.json();
}

function maybeParseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return {};
  }
}

async function withFallback(pathname, searchParams, social, queryFn, allowExternal) {
  let local = null;
  try {
    local = await queryFn();
  } catch (_) {
    local = null;
  }
  if (local !== null) return local;
  await enqueueHydration('api_miss', { pathname, query: Object.fromEntries(searchParams.entries()) }).catch(() => {});
  if (!allowExternal) return null;
  if (social && !config.enableSocialFallback) {
    if (pathname.includes('/stats/')) return [];
    if (pathname.endsWith('/profiles')) return { profiles: [], numPages: 1 };
    if (pathname.endsWith('/activity')) return { votes: [], numPages: 1 };
    if (pathname.endsWith('/posts')) return { posts: [], numPages: 1 };
    if (pathname.endsWith('/votes')) return { votes: [], numPages: 1 };
    return null;
  }
  try {
    return await fallbackApi(pathname, searchParams, social);
  } catch (err) {
    if (pathname.includes('/stats/')) return [];
    throw err;
  }
}

async function explorerOverview() {
  const rows = await sql(`SELECT height, hash, time, size, n_tx FROM blocks ORDER BY height DESC LIMIT 1`);
  if (!rows.length) return null;
  const peers = await explorerNetworkPeers().catch(() => null);
  return {
    mininginfo: { blocks: toInt(rows[0].height, 0) },
    peerinfo: Array.isArray(peers?.peers) ? peers.peers : [],
    latestBlock: rows[0]
  };
}

async function explorerBlocks(searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT height, hash, time, size, n_tx
     FROM blocks
     ORDER BY height DESC
     LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
  if (!rows.length) return null;
  const tip = await sql(`SELECT MAX(height) AS tipHeight FROM blocks`);
  return {
    blocks: rows.map((r) => ({
      blockInfo: {
        height: toInt(r.height),
        hash: String(r.hash || ''),
        blockSize: toInt(r.size),
        numTxs: toInt(r.n_tx),
        timestamp: toInt(r.time),
        numBurnedSats: 0
      }
    })),
    page,
    pageSize,
    tipHeight: toInt(tip?.[0]?.tipHeight, 0)
  };
}

async function explorerBlockDetail(hashOrHeight) {
  const byHeight = /^[0-9]+$/.test(hashOrHeight);
  const blockRows = byHeight
    ? await sql(`SELECT height, hash, time, size, n_tx FROM blocks WHERE height = ? LIMIT 1`, toInt(hashOrHeight))
    : await sql(`SELECT height, hash, time, size, n_tx FROM blocks WHERE hash = ? LIMIT 1`, hashOrHeight);
  if (!blockRows.length) return null;
  const block = blockRows[0];
  const txRows = await sql(
    `SELECT txid, block_time, size, raw_json FROM transactions WHERE block_height = ? ORDER BY txid ASC`,
    toInt(block.height)
  );
  return {
    blockInfo: {
      height: toInt(block.height),
      hash: String(block.hash || ''),
      timestamp: toInt(block.time),
      blockSize: toInt(block.size),
      numTxs: toInt(block.n_tx),
      reward: 0,
      numBurnedSats: 0
    },
    txs: txRows.map((tx) => {
      const raw = maybeParseJson(tx.raw_json);
      const inputs = Array.isArray(raw.inputs) ? raw.inputs : [];
      const outputs = Array.isArray(raw.outputs) ? raw.outputs : [];
      return {
        txid: tx.txid,
        timeFirstSeen: toInt(tx.block_time),
        size: toInt(tx.size),
        inputs,
        outputs,
        sumBurnedSats: 0,
        isCoinbase: inputs.some((i) => i && i.coinbase)
      };
    }),
    minedBy: ''
  };
}

async function explorerTxDetail(txid) {
  const txRows = await sql(
    `SELECT txid, block_hash, block_time, size FROM transactions WHERE txid = ? LIMIT 1`,
    txid
  );
  if (!txRows.length) return null;
  const inRows = await sql(
    `SELECT i.coinbase_hex, i.prev_txid, i.prev_vout, o.value_sats AS prev_value
     FROM tx_inputs i
     LEFT JOIN tx_outputs o ON o.txid = i.prev_txid AND o.vout = i.prev_vout
     WHERE i.txid = ?
     ORDER BY i.vin ASC`,
    txid
  );
  const outRows = await sql(`SELECT address, value_sats, op_return_hex FROM tx_outputs WHERE txid = ? ORDER BY vout ASC`, txid);
  return {
    txid,
    timeFirstSeen: toInt(txRows[0].block_time),
    size: toInt(txRows[0].size),
    confirmations: 1,
    isCoinbase: inRows.some((r) => Boolean(r.coinbase_hex)),
    block: {
      hash: String(txRows[0].block_hash || ''),
      timestamp: toInt(txRows[0].block_time)
    },
    inputs: inRows.map((r) => ({
      address: r.coinbase_hex ? '' : '-',
      value: r.coinbase_hex ? null : toInt(r.prev_value, 0),
      isCoinbase: Boolean(r.coinbase_hex)
    })),
    outputs: outRows.map((r) => ({
      address: String(r.address || ''),
      value: toInt(r.value_sats),
      rankOutput: String(r.op_return_hex || '').toUpperCase().includes('52414E4B') ? {} : null
    }))
  };
}

async function explorerAddress(address, searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const countRows = await sql(`SELECT COUNT(DISTINCT txid) AS c FROM tx_outputs WHERE address = ?`, address);
  const total = toInt(countRows?.[0]?.c, 0);
  if (!total) return null;
  const txRows = await sql(
    `SELECT t.txid, t.block_time, t.block_hash, t.size
     FROM transactions t
     JOIN tx_outputs o ON o.txid = t.txid
     WHERE o.address = ?
     GROUP BY t.txid
     ORDER BY t.block_time DESC
     LIMIT ? OFFSET ?`,
    address,
    pageSize,
    offset
  );
  return {
    history: {
      txs: txRows.map((t) => ({
        txid: t.txid,
        timeFirstSeen: toInt(t.block_time),
        size: toInt(t.size),
        sumBurnedSats: 0,
        inputs: [],
        outputs: [],
        block: { hash: String(t.block_hash || ''), timestamp: toInt(t.block_time) }
      })),
      numPages: Math.max(1, Math.ceil(total / pageSize))
    },
    lastSeen: toInt(txRows?.[0]?.block_time, 0)
  };
}

async function explorerAddressBalance(address) {
  const rows = await sql(
    `SELECT COALESCE(balance_sats, 0) AS balance
     FROM address_balances
     WHERE address = ?
     LIMIT 1`,
    address
  );
  if (!rows.length) return null;
  return toInt(rows[0].balance, 0);
}

function statsPeriodConfig(period) {
  const p = String(period || 'day');
  if (p === 'week') return { key: 'week', points: 7 * 24 };
  if (p === 'month') return { key: 'month', points: 31 * 24 };
  if (p === 'quarter') return { key: 'quarter', points: 90 * 24 };
  if (p === 'year') return { key: 'year', points: 365 };
  return { key: 'day', points: 24 * 12 };
}

async function explorerStatsCards() {
  const tipRows = await sql(`SELECT MAX(height) AS tipHeight FROM blocks`);
  const statRows = await sql(
    `SELECT hashrate, difficulty, mempool_count, mempool_bytes
     FROM chain_stats_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT 1`
  );
  const supplyRows = await sql(
    `SELECT total_supply_sats, burned_sats, inflation_bps
     FROM supply_stats_daily
     ORDER BY day_ts DESC
     LIMIT 1`
  );
  if (!tipRows.length) {
    return {
      tipHeight: 0,
      hashrate: 0,
      difficulty: 0,
      mempoolCount: 0,
      mempoolBytes: 0,
      totalSupplySats: 0,
      burnedSupplySats: 0,
      inflationPct: 0
    };
  }
  return {
    tipHeight: toInt(tipRows?.[0]?.tipHeight, 0),
    hashrate: Number(statRows?.[0]?.hashrate || 0),
    difficulty: Number(statRows?.[0]?.difficulty || 0),
    mempoolCount: toInt(statRows?.[0]?.mempool_count, 0),
    mempoolBytes: toInt(statRows?.[0]?.mempool_bytes, 0),
    totalSupplySats: toInt(supplyRows?.[0]?.total_supply_sats, 0),
    burnedSupplySats: toInt(supplyRows?.[0]?.burned_sats, 0),
    inflationPct: Number(toInt(supplyRows?.[0]?.inflation_bps, 0) / 100)
  };
}

async function explorerMempool(searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT txid, block_time, size
     FROM transactions
     WHERE block_height IS NULL OR block_height = 0
     ORDER BY block_time DESC, txid DESC
     LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
  return rows.map((r) => ({
    txid: String(r.txid || ''),
    timeFirstSeen: toInt(r.block_time, 0),
    size: toInt(r.size, 0)
  }));
}

async function explorerMempoolStats() {
  const snap = await sql(
    `SELECT snapshot_ts, tx_count, total_bytes
     FROM mempool_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT 1`
  );
  return {
    txCount: toInt(snap?.[0]?.tx_count, 0),
    totalBytes: toInt(snap?.[0]?.total_bytes, 0),
    snapshotTs: toInt(snap?.[0]?.snapshot_ts, 0)
  };
}

async function explorerMempoolHistory(searchParams) {
  const conf = statsPeriodConfig(searchParams.get('period'));
  const rows = await sql(
    `SELECT snapshot_ts, tx_count, total_bytes
     FROM mempool_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT ?`,
    conf.points
  );
  return {
    period: conf.key,
    series: rows.slice().reverse().map((r) => ({
      ts: toInt(r.snapshot_ts, 0),
      txCount: toInt(r.tx_count, 0),
      totalBytes: toInt(r.total_bytes, 0)
    }))
  };
}

async function explorerStatsCharts(searchParams) {
  const conf = statsPeriodConfig(searchParams.get('period'));
  const rows = await sql(
    `SELECT snapshot_ts, block_height, hashrate, difficulty, mempool_count
     FROM chain_stats_snapshots
     ORDER BY snapshot_ts DESC
     LIMIT ?`,
    conf.points
  );
  if (!rows.length) return { period: conf.key, series: [] };
  const supplyRows = await sql(
    `SELECT day_ts, total_supply_sats, burned_sats
     FROM supply_stats_daily
     ORDER BY day_ts DESC
     LIMIT 400`
  );
  const byDay = new Map(
    supplyRows.map((r) => [toInt(r.day_ts, 0), { total: toInt(r.total_supply_sats, 0), burned: toInt(r.burned_sats, 0) }])
  );
  const series = rows
    .slice()
    .reverse()
    .map((r) => {
      const ts = toInt(r.snapshot_ts, 0);
      const dayTs = ts > 0 ? Math.floor(ts / 86400) * 86400 : 0;
      const s = byDay.get(dayTs) || { total: 0, burned: 0 };
      return {
        ts,
        blockHeight: toInt(r.block_height, 0),
        hashrate: Number(r.hashrate || 0),
        difficulty: Number(r.difficulty || 0),
        mempoolCount: toInt(r.mempool_count, 0),
        totalSupplySats: s.total,
        burnedSupplySats: s.burned
      };
    });
  return { period: conf.key, series };
}

async function explorerRichlistBalance(searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const totalRows = await sql(`SELECT COALESCE(SUM(balance_sats), 0) AS total FROM address_balances`);
  const total = toInt(totalRows?.[0]?.total, 0);
  const rows = await sql(
    `SELECT address, balance_sats
     FROM address_balances
     ORDER BY balance_sats DESC, address ASC
     LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
  if (!rows.length) return { page, pageSize, rows: [] };
  return {
    page,
    pageSize,
    rows: rows.map((r, idx) => {
      const balance = toInt(r.balance_sats, 0);
      return {
        rank: offset + idx + 1,
        address: String(r.address || ''),
        balanceSats: balance,
        balanceXpi: Number(balance / 1000000),
        pct: total > 0 ? Number((balance / total) * 100) : 0
      };
    })
  };
}

async function explorerRichlistReceived(searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT address, received_sats
     FROM address_received
     ORDER BY received_sats DESC, address ASC
     LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
  if (!rows.length) return { page, pageSize, rows: [] };
  return {
    page,
    pageSize,
    rows: rows.map((r, idx) => {
      const received = toInt(r.received_sats, 0);
      return {
        rank: offset + idx + 1,
        address: String(r.address || ''),
        receivedSats: received,
        receivedXpi: Number(received / 1000000)
      };
    })
  };
}

async function explorerRichlistWealth() {
  const rows = await sql(
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
  if (!rows.length) return { buckets: [] };
  const totalRows = await sql(`SELECT COALESCE(SUM(balance_sats), 0) AS total FROM address_balances`);
  const total = toInt(totalRows?.[0]?.total, 0);
  return {
    buckets: rows.map((r) => ({
      label: String(r.label || ''),
      count: toInt(r.holder_count, 0),
      totalSats: toInt(r.total_sats, 0),
      pct: total > 0 ? Number((toInt(r.total_sats, 0) / total) * 100) : 0
    }))
  };
}

async function explorerNetworkPeers() {
  const capRows = await sql(`SELECT MAX(captured_at) AS ts FROM peer_snapshots`);
  const cap = toInt(capRows?.[0]?.ts, 0);
  if (!cap) return { capturedAt: 0, peers: [] };
  const rows = await sql(
    `SELECT address, subver, protocol_version, synced_blocks, country_code, country_name, captured_at, addnode_line, onetry_line
     FROM peer_snapshots
     WHERE captured_at = ?
     ORDER BY address ASC`,
    cap
  );
  return {
    capturedAt: cap,
    peers: rows.map((r) => ({
      address: String(r.address || ''),
      subver: String(r.subver || ''),
      protocolVersion: toInt(r.protocol_version, 0),
      syncedBlocks: toInt(r.synced_blocks, 0),
      countryCode: String(r.country_code || ''),
      countryName: String(r.country_name || ''),
      lastSeen: toInt(r.captured_at, 0),
      addnodeLine: String(r.addnode_line || ''),
      onetryLine: String(r.onetry_line || '')
    }))
  };
}

async function explorerNetworkNodes() {
  const peers = await explorerNetworkPeers();
  if (!peers || !Array.isArray(peers.peers) || !peers.peers.length) return { addnode: [], onetry: [] };
  const addnode = [];
  const onetry = [];
  for (const p of peers.peers) {
    const host = String(p.address || '');
    if (!host) continue;
    addnode.push(p.addnodeLine || `addnode=${host}`);
    onetry.push(p.onetryLine || `onetry=${host}`);
  }
  return { addnode, onetry };
}

async function socialProfiles(searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT
       p.dim_value AS platform,
       r.dim_value AS id,
       e.score AS ranking,
       e.count_in AS votesPositive,
       e.count_out AS votesNegative
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key = 'platform'
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key = 'profile_id'
     WHERE e.domain = 'social' AND e.object_type = 'profile'
     ORDER BY CAST(e.score AS REAL) DESC
     LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
  if (!rows.length) return null;
  const count = await sql(`SELECT COUNT(*) AS c FROM domain_entities WHERE domain='social' AND object_type='profile'`);
  return { profiles: rows, numPages: Math.max(1, Math.ceil(toInt(count?.[0]?.c, rows.length) / pageSize)) };
}

async function socialActivity(searchParams) {
  const { page, pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT
       e.txid,
       e.block_time AS firstSeen,
       p.dim_value AS platform,
       r.dim_value AS profileId,
       COALESCE(po.dim_value, '') AS postId,
       e.direction,
       e.amount_text AS sats
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id = e.event_id AND p.dim_key = 'platform'
     JOIN domain_event_dims r ON r.event_id = e.event_id AND r.dim_key = 'profile_id'
     LEFT JOIN domain_event_dims po ON po.event_id = e.event_id AND po.dim_key = 'post_id'
     WHERE e.domain = 'social' AND e.activity_type = 'vote'
     ORDER BY e.block_time DESC
     LIMIT ? OFFSET ?`,
    pageSize,
    offset
  );
  if (!rows.length) return null;
  const count = await sql(`SELECT COUNT(*) AS c FROM domain_events WHERE domain='social' AND activity_type='vote'`);
  return {
    votes: rows.map((r) => ({
      txid: r.txid,
      firstSeen: toInt(r.firstSeen),
      platform: r.platform,
      profileId: r.profileId,
      postId: r.postId,
      sats: r.sats,
      sentiment: r.direction === 'in' ? 'positive' : r.direction === 'out' ? 'negative' : 'neutral'
    })),
    numPages: Math.max(1, Math.ceil(toInt(count?.[0]?.c, rows.length) / pageSize))
  };
}

async function socialProfile(platform, profileId) {
  const rows = await sql(
    `SELECT e.score AS ranking, e.count_in AS votesPositive, e.count_out AS votesNegative
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key='platform' AND p.dim_value=?
     JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key='profile_id' AND r.dim_value=?
     WHERE e.domain='social' AND e.object_type='profile'
     LIMIT 1`,
    platform,
    profileId
  );
  if (!rows.length) return null;
  return { platform, id: profileId, ...rows[0] };
}

async function socialPosts(platform, profileId, searchParams) {
  const { pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT po.dim_value AS id, e.score AS ranking, e.count_in AS votesPositive, e.count_out AS votesNegative
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id=e.entity_id AND p.dim_key='platform' AND p.dim_value=?
     JOIN domain_entity_dims r ON r.entity_id=e.entity_id AND r.dim_key='profile_id' AND r.dim_value=?
     JOIN domain_entity_dims po ON po.entity_id=e.entity_id AND po.dim_key='post_id'
     WHERE e.domain='social' AND e.object_type='post'
     ORDER BY CAST(e.score AS REAL) DESC
     LIMIT ? OFFSET ?`,
    platform,
    profileId,
    pageSize,
    offset
  );
  if (!rows.length) return null;
  const c = await sql(
    `SELECT COUNT(*) AS c
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id=e.entity_id AND p.dim_key='platform' AND p.dim_value=?
     JOIN domain_entity_dims r ON r.entity_id=e.entity_id AND r.dim_key='profile_id' AND r.dim_value=?
     WHERE e.domain='social' AND e.object_type='post'`,
    platform,
    profileId
  );
  return { posts: rows, numPages: Math.max(1, Math.ceil(toInt(c?.[0]?.c, rows.length) / pageSize)) };
}

async function socialVotes(platform, profileId, searchParams) {
  const { pageSize, offset } = pageAndSize(searchParams);
  const rows = await sql(
    `SELECT e.txid, e.block_time AS timestamp, e.amount_text AS sats, e.direction, COALESCE(po.dim_value, '') AS postId
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id=e.event_id AND p.dim_key='platform' AND p.dim_value=?
     JOIN domain_event_dims r ON r.event_id=e.event_id AND r.dim_key='profile_id' AND r.dim_value=?
     LEFT JOIN domain_event_dims po ON po.event_id=e.event_id AND po.dim_key='post_id'
     WHERE e.domain='social' AND e.activity_type='vote'
     ORDER BY e.block_time DESC
     LIMIT ? OFFSET ?`,
    platform,
    profileId,
    pageSize,
    offset
  );
  if (!rows.length) return null;
  const c = await sql(
    `SELECT COUNT(*) AS c
     FROM domain_events e
     JOIN domain_event_dims p ON p.event_id=e.event_id AND p.dim_key='platform' AND p.dim_value=?
     JOIN domain_event_dims r ON r.event_id=e.event_id AND r.dim_key='profile_id' AND r.dim_value=?
     WHERE e.domain='social' AND e.activity_type='vote'`,
    platform,
    profileId
  );
  return {
    votes: rows.map((r) => ({
      txid: r.txid,
      timestamp: toInt(r.timestamp),
      sentiment: r.direction === 'in' ? 'positive' : r.direction === 'out' ? 'negative' : 'neutral',
      sats: r.sats,
      post: { id: r.postId, ranking: '0' }
    })),
    numPages: Math.max(1, Math.ceil(toInt(c?.[0]?.c, rows.length) / pageSize))
  };
}

async function socialStats(kind, direction) {
  const objectType = kind === 'profiles' ? 'profile' : 'post';
  const order = direction === 'top' ? 'DESC' : 'ASC';
  const rows = await sql(
    `SELECT p.dim_value AS platform, r.dim_value AS profileId, COALESCE(po.dim_value, '') AS postId, e.score AS ranking
     FROM domain_entities e
     JOIN domain_entity_dims p ON p.entity_id=e.entity_id AND p.dim_key='platform'
     JOIN domain_entity_dims r ON r.entity_id=e.entity_id AND r.dim_key='profile_id'
     LEFT JOIN domain_entity_dims po ON po.entity_id=e.entity_id AND po.dim_key='post_id'
     WHERE e.domain='social' AND e.object_type=?
     ORDER BY CAST(e.score AS REAL) ${order}
     LIMIT 10`,
    objectType
  );
  return rows.length ? rows : null;
}

export async function handleApiRequest(pathname, searchParams) {
  const isSocial = pathname.startsWith('/api/social/');
  if (pathname === '/api/explorer/overview') return withFallback(pathname, searchParams, false, explorerOverview, false);
  if (pathname === '/api/explorer/chain-info') {
    return withFallback(pathname, searchParams, false, async () => {
      const out = await explorerOverview();
      return out ? { tipHeight: toInt(out?.mininginfo?.blocks, 0) } : null;
    }, false);
  }
  if (pathname === '/api/explorer/mempool') return withFallback(pathname, searchParams, false, () => explorerMempool(searchParams), false);
  if (pathname === '/api/explorer/mempool/stats') return withFallback(pathname, searchParams, false, explorerMempoolStats, false);
  if (pathname === '/api/explorer/mempool/history') return withFallback(pathname, searchParams, false, () => explorerMempoolHistory(searchParams), false);
  if (pathname === '/api/explorer/blocks') return withFallback(pathname, searchParams, false, () => explorerBlocks(searchParams), false);
  if (pathname === '/api/explorer/stats/cards') return withFallback(pathname, searchParams, false, explorerStatsCards, false);
  if (pathname === '/api/explorer/stats/charts') return withFallback(pathname, searchParams, false, () => explorerStatsCharts(searchParams), false);
  if (pathname === '/api/explorer/richlist/balance') return withFallback(pathname, searchParams, false, () => explorerRichlistBalance(searchParams), false);
  if (pathname === '/api/explorer/richlist/received') return withFallback(pathname, searchParams, false, () => explorerRichlistReceived(searchParams), false);
  if (pathname === '/api/explorer/richlist/wealth') return withFallback(pathname, searchParams, false, explorerRichlistWealth, false);
  if (pathname === '/api/explorer/network/peers') return withFallback(pathname, searchParams, false, explorerNetworkPeers, false);
  if (pathname === '/api/explorer/network/nodes') return withFallback(pathname, searchParams, false, explorerNetworkNodes, false);

  let m = pathname.match(/^\/api\/explorer\/block\/([^/]+)$/);
  if (m) return withFallback(pathname, searchParams, false, () => explorerBlockDetail(decodeURIComponent(m[1])), false);
  m = pathname.match(/^\/api\/explorer\/tx\/([^/]+)$/);
  if (m) return withFallback(pathname, searchParams, false, () => explorerTxDetail(decodeURIComponent(m[1])), false);
  m = pathname.match(/^\/api\/explorer\/address\/([^/]+)\/balance$/);
  if (m) return withFallback(pathname, searchParams, false, () => explorerAddressBalance(decodeURIComponent(m[1])), false);
  m = pathname.match(/^\/api\/explorer\/address\/([^/]+)$/);
  if (m) return withFallback(pathname, searchParams, false, () => explorerAddress(decodeURIComponent(m[1]), searchParams), false);

  if (pathname === '/api/social/profiles') return withFallback(pathname, searchParams, true, () => socialProfiles(searchParams), config.enableSocialFallback);
  if (pathname === '/api/social/activity') return withFallback(pathname, searchParams, true, () => socialActivity(searchParams), config.enableSocialFallback);
  if (pathname === '/api/social/stats/profiles/top-ranked/today') return withFallback(pathname, searchParams, true, () => socialStats('profiles', 'top'), config.enableSocialFallback);
  if (pathname === '/api/social/stats/profiles/lowest-ranked/today') return withFallback(pathname, searchParams, true, () => socialStats('profiles', 'low'), config.enableSocialFallback);
  if (pathname === '/api/social/stats/posts/top-ranked/today') return withFallback(pathname, searchParams, true, () => socialStats('posts', 'top'), config.enableSocialFallback);
  if (pathname === '/api/social/stats/posts/lowest-ranked/today') return withFallback(pathname, searchParams, true, () => socialStats('posts', 'low'), config.enableSocialFallback);

  m = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)\/posts$/);
  if (m) return withFallback(pathname, searchParams, isSocial, () => socialPosts(decodeURIComponent(m[1]), decodeURIComponent(m[2]), searchParams), config.enableSocialFallback);
  m = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)\/votes$/);
  if (m) return withFallback(pathname, searchParams, isSocial, () => socialVotes(decodeURIComponent(m[1]), decodeURIComponent(m[2]), searchParams), config.enableSocialFallback);
  m = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)$/);
  if (m) return withFallback(pathname, searchParams, isSocial, () => socialProfile(decodeURIComponent(m[1]), decodeURIComponent(m[2])), config.enableSocialFallback);

  return null;
}

