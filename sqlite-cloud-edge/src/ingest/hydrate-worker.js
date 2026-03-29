import { sql } from '../db/client.js';
import { getBlock, getBlockchainInfo } from './lotus-api-client.js';
import { indexBlock } from './index-block.js';
import { config } from '../config.js';

function now() {
  return Date.now();
}

function parsePayload(json) {
  if (!json) return {};
  if (typeof json === 'object') return json;
  try {
    return JSON.parse(String(json));
  } catch (_) {
    return {};
  }
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function hasTxs(block) {
  return Array.isArray(block?.txs) && block.txs.length > 0;
}

async function fetchExplorerFallbackBlock(hashOrHeight) {
  const base = (config.explorerFallbackBase || 'https://explorer.lotusia.org').replace(/\/+$/, '');
  const byHash = String(hashOrHeight);
  const res = await fetch(`${base}/api/getblock?hash=${encodeURIComponent(byHash)}`);
  if (!res.ok) throw new Error(`explorer getblock failed ${res.status}`);
  return res.json();
}

async function fetchExplorerFallbackTx(txid) {
  const base = (config.explorerFallbackBase || 'https://explorer.lotusia.org').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/getrawtransaction?txid=${encodeURIComponent(String(txid))}&decrypt=1`);
  if (!res.ok) throw new Error(`explorer getrawtransaction failed ${res.status}`);
  return res.json();
}

function valueToSats(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n > 1_000_000) return Math.floor(n);
  return Math.floor(n * 100_000_000);
}

function normalizeExplorerTx(raw) {
  const vin = Array.isArray(raw?.vin) ? raw.vin : [];
  const vout = Array.isArray(raw?.vout) ? raw.vout : [];
  return {
    txid: raw?.txid || '',
    size: Number(raw?.size || raw?.vsize || 0),
    lockTime: Number(raw?.locktime || 0),
    version: Number(raw?.version || 0),
    inputs: vin.map((i) => ({
      prevOut: {
        txid: i?.txid || '',
        outIdx: Number(i?.vout ?? -1)
      },
      coinbase: i?.coinbase || '',
      sequence: Number(i?.sequence || 0),
      inputScript: i?.scriptSig?.hex || ''
    })),
    outputs: vout.map((o) => ({
      value: valueToSats(o?.value),
      outputScript: o?.scriptPubKey?.hex || '',
      scriptPubKey: {
        type: o?.scriptPubKey?.type || '',
        addresses: Array.isArray(o?.scriptPubKey?.addresses) ? o.scriptPubKey.addresses : []
      },
      address: Array.isArray(o?.scriptPubKey?.addresses) ? (o.scriptPubKey.addresses[0] || '') : ''
    }))
  };
}

async function buildIndexableBlockFromExplorer(hashOrHeight) {
  const rawBlock = await fetchExplorerFallbackBlock(hashOrHeight);
  const txids = Array.isArray(rawBlock?.tx) ? rawBlock.tx : [];
  const txs = [];
  for (const txid of txids) {
    try {
      const rawTx = await fetchExplorerFallbackTx(txid);
      txs.push(normalizeExplorerTx(rawTx));
    } catch (_) {}
  }
  return {
    blockInfo: {
      height: Number(rawBlock?.height || 0),
      hash: String(rawBlock?.hash || ''),
      prevHash: String(rawBlock?.previousblockhash || ''),
      timestamp: Number(rawBlock?.time || 0),
      blockSize: Number(rawBlock?.size || 0),
      numTxs: Number(rawBlock?.nTx || txids.length || 0)
    },
    txs
  };
}

async function fetchTipHashFromFallbackApi() {
  const base = (config.fallbackExplorerApiBase || 'https://explorer.lotusia.org').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/explorer/blocks?page=1&pageSize=1`);
  if (!res.ok) throw new Error(`fallback explorer blocks failed ${res.status}`);
  const payload = await res.json();
  const first = Array.isArray(payload?.blocks) ? payload.blocks[0] : null;
  return first?.hash || first?.blockInfo?.hash || '';
}

async function fetchFallbackApi(pathname, query = {}, social = false) {
  const base = (
    social
      ? (config.fallbackSocialApiBase || '')
      : (config.fallbackExplorerApiBase || 'https://explorer.lotusia.org')
  ).replace(/\/+$/, '');
  const u = new URL(pathname, base);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && String(v) !== '') {
      u.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`fallback ${pathname} failed ${res.status}`);
  return res.json();
}

async function upsertPeerSnapshots(peers) {
  const capturedAt = now();
  const list = Array.isArray(peers) ? peers : [];
  for (const p of list) {
    const addr = String(p?.addr || p?.address || '').trim();
    if (!addr) continue;
    const peerId = `${capturedAt}:${addr}`;
    await sql(
      `INSERT OR REPLACE INTO peer_snapshots(
        peer_id, captured_at, address, subver, protocol_version, synced_blocks, country_code, country_name, addnode_line, onetry_line
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      peerId,
      capturedAt,
      addr,
      String(p?.subver || p?.version || ''),
      toInt(p?.version || p?.protocolVersion || 0),
      toInt(p?.synced_headers ?? p?.synced_blocks ?? p?.height ?? 0),
      String(p?.geoip?.countryCode || p?.geoip?.country_code || ''),
      String(p?.geoip?.country || p?.geoip?.countryName || ''),
      `addnode=${addr}`,
      `onetry=${addr}`
    );
  }
}

async function upsertProfileEntity(platform, profileId, profile) {
  const nowMs = now();
  const entityId = `social:profile:rank:${platform}:${profileId}`;
  await sql(
    `INSERT OR REPLACE INTO domain_entities(
      entity_id, domain, object_type, source_protocol, score, amount_in, amount_out, count_in, count_out, identity_json, state_json, updated_at
    ) VALUES(?, 'social', 'profile', 'rank', ?, ?, ?, ?, ?, ?, ?, ?)`,
    entityId,
    String(profile?.ranking ?? '0'),
    String(profile?.satsPositive ?? profile?.sats_positive ?? '0'),
    String(profile?.satsNegative ?? profile?.sats_negative ?? '0'),
    toInt(profile?.votesPositive ?? profile?.votes_positive ?? 0),
    toInt(profile?.votesNegative ?? profile?.votes_negative ?? 0),
    JSON.stringify({ platform, profile_id: profileId }),
    JSON.stringify(profile || {}),
    nowMs
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'platform', ?)`,
    entityId,
    platform
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'profile_id', ?)`,
    entityId,
    profileId
  );
}

async function upsertPostEntity(platform, profileId, post) {
  const postId = String(post?.id || post?.postId || '');
  if (!postId) return;
  const nowMs = now();
  const entityId = `social:post:rank:${platform}:${profileId}:${postId}`;
  await sql(
    `INSERT OR REPLACE INTO domain_entities(
      entity_id, domain, object_type, source_protocol, score, amount_in, amount_out, count_in, count_out, identity_json, state_json, updated_at
    ) VALUES(?, 'social', 'post', 'rank', ?, ?, ?, ?, ?, ?, ?, ?)`,
    entityId,
    String(post?.ranking ?? '0'),
    String(post?.satsPositive ?? '0'),
    String(post?.satsNegative ?? '0'),
    toInt(post?.votesPositive ?? 0),
    toInt(post?.votesNegative ?? 0),
    JSON.stringify({ platform, profile_id: profileId, post_id: postId }),
    JSON.stringify(post || {}),
    nowMs
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'platform', ?)`,
    entityId,
    platform
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'profile_id', ?)`,
    entityId,
    profileId
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'post_id', ?)`,
    entityId,
    postId
  );
}

async function upsertVoteEvent(vote, idx = 0) {
  const txid = String(vote?.txid || '');
  const platform = String(vote?.platform || 'twitter');
  const profileId = String(vote?.profileId || vote?.profile_id || '');
  const postId = String(vote?.postId || vote?.post?.id || '');
  if (!txid || !profileId) return;
  const eventId = `${txid}:${idx}`;
  const sentiment = String(vote?.sentiment || '').toLowerCase();
  const direction = sentiment === 'positive' ? 'in' : sentiment === 'negative' ? 'out' : 'neutral';
  const ts = toInt(vote?.timestamp ?? vote?.firstSeen ?? 0, now());
  await sql(
    `INSERT OR REPLACE INTO domain_events(
      event_id, domain, activity_type, source_protocol, txid, block_height, block_time, direction, amount_text, payload_json, context_json, created_at
    ) VALUES(?, 'social', 'vote', 'rank', ?, NULL, ?, ?, ?, ?, ?, ?)`,
    eventId,
    txid,
    ts,
    direction,
    String(vote?.sats ?? '0'),
    JSON.stringify(vote || {}),
    JSON.stringify({ platform, profile_id: profileId, post_id: postId }),
    ts
  );
  await sql(`INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value) VALUES(?, 'platform', ?)`, eventId, platform);
  await sql(`INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value) VALUES(?, 'profile_id', ?)`, eventId, profileId);
  if (postId) {
    await sql(`INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value) VALUES(?, 'post_id', ?)`, eventId, postId);
  }
}

async function hydrateSocialFromFallback(pathname, query) {
  if (!config.enableSocialFallback || !config.fallbackSocialApiBase) {
    return;
  }
  if (pathname === '/api/social/profiles') {
    const payload = await fetchFallbackApi(pathname, query, true);
    const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
    for (const p of profiles) {
      const platform = String(p?.platform || 'twitter');
      const profileId = String(p?.id || p?.profileId || '');
      if (!profileId) continue;
      await upsertProfileEntity(platform, profileId, p);
    }
    return;
  }

  if (pathname === '/api/social/activity') {
    const payload = await fetchFallbackApi(pathname, query, true);
    const votes = Array.isArray(payload?.votes) ? payload.votes : [];
    for (let i = 0; i < votes.length; i += 1) {
      await upsertVoteEvent(votes[i], i);
    }
    return;
  }

  let m = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)$/);
  if (m) {
    const platform = decodeURIComponent(m[1]);
    const profileId = decodeURIComponent(m[2]);
    const payload = await fetchFallbackApi(pathname, query, true);
    await upsertProfileEntity(platform, profileId, payload || {});
    return;
  }

  m = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)\/posts$/);
  if (m) {
    const platform = decodeURIComponent(m[1]);
    const profileId = decodeURIComponent(m[2]);
    const payload = await fetchFallbackApi(pathname, query, true);
    const posts = Array.isArray(payload?.posts) ? payload.posts : [];
    for (const post of posts) {
      await upsertPostEntity(platform, profileId, post);
    }
    return;
  }

  m = pathname.match(/^\/api\/social\/([^/]+)\/([^/]+)\/votes$/);
  if (m) {
    const payload = await fetchFallbackApi(pathname, query, true);
    const votes = Array.isArray(payload?.votes) ? payload.votes : [];
    for (let i = 0; i < votes.length; i += 1) {
      await upsertVoteEvent(votes[i], i);
    }
  }
}

async function hydrateFromMiss(pathname, query) {
  if (pathname === '/api/explorer/overview' || pathname === '/api/explorer/chain-info' || pathname === '/api/explorer/blocks') {
    let tip = '';
    try {
      const info = await getBlockchainInfo();
      tip = info?.tipHash || info?.bestHash || info?.bestblockhash || info?.tip_height || info?.tipHeight || '';
    } catch (_) {
      tip = '';
    }
    if (!tip) {
      tip = await fetchTipHashFromFallbackApi();
    }
    if (tip) {
      let block = null;
      try {
        block = await getBlock(String(tip));
      } catch (_) {
        block = null;
      }
      if (!hasTxs(block)) {
        block = await buildIndexableBlockFromExplorer(String(tip));
      }
      await indexBlock(block);
    }
    try {
      const overview = await fetchFallbackApi('/api/explorer/overview', {}, false);
      await upsertPeerSnapshots(Array.isArray(overview?.peerinfo) ? overview.peerinfo : []);
    } catch (_) {}
    return;
  }
  const blockMatch = String(pathname || '').match(/^\/api\/explorer\/block\/([^/]+)$/);
  if (blockMatch) {
    const hashOrHeight = decodeURIComponent(blockMatch[1]);
    try {
      let block = await getBlock(hashOrHeight);
      if (!hasTxs(block)) {
        block = await buildIndexableBlockFromExplorer(hashOrHeight);
      }
      await indexBlock(block);
      return;
    } catch (_) {}

    const block = await buildIndexableBlockFromExplorer(hashOrHeight);
    await indexBlock(block);
    return;
  }

  if (pathname.startsWith('/api/social/')) {
    await hydrateSocialFromFallback(pathname, query);
    return;
  }

  if (pathname === '/api/explorer/network/peers' || pathname === '/api/explorer/network/nodes') {
    const overview = await fetchFallbackApi('/api/explorer/overview', {}, false);
    await upsertPeerSnapshots(Array.isArray(overview?.peerinfo) ? overview.peerinfo : []);
    return;
  }
}

async function repairSparseBlocks(limit = 3) {
  const rows = await sql(
    `SELECT b.hash
     FROM blocks b
     WHERE b.n_tx > 0 AND NOT EXISTS (
       SELECT 1 FROM transactions t WHERE t.block_height = b.height
     )
     ORDER BY b.height DESC
     LIMIT ?`,
    Math.max(1, Math.min(20, Number(limit || 3)))
  );
  for (const row of rows) {
    const hash = String(row?.hash || '');
    if (!hash) continue;
    const block = await buildIndexableBlockFromExplorer(hash);
    await indexBlock(block);
  }
}

async function processJob(job) {
  const payload = parsePayload(job.payload_json);
  const apiMiss = payload && payload.pathname ? payload : (payload.payload || {});
  const pathname = String(apiMiss.pathname || '');
  const query = apiMiss.query || {};
  await hydrateFromMiss(pathname, query);
}

async function markJob(id, status, attempts, errorMessage = '') {
  const ts = now();
  await sql(
    `UPDATE ingest_jobs
     SET status = ?, attempts = ?, last_error = ?, updated_at = ?, next_run_at = ?
     WHERE id = ?`,
    status,
    attempts,
    errorMessage ? String(errorMessage).slice(0, 500) : null,
    ts,
    ts + (status === 'queued' ? 60_000 : 0),
    id
  );
}

export async function runHydrationBatch(limit = 25) {
  const jobs = await sql(
    `SELECT id, payload_json, attempts
     FROM ingest_jobs
     WHERE status = 'queued' AND next_run_at <= ?
     ORDER BY created_at ASC
     LIMIT ?`,
    now(),
    Math.max(1, Math.min(500, Number(limit || 25)))
  );

  let ok = 0;
  let failed = 0;
  for (const job of jobs) {
    const attempts = Number(job.attempts || 0) + 1;
    try {
      await processJob(job);
      await markJob(job.id, 'done', attempts);
      ok += 1;
    } catch (err) {
      const terminal = attempts >= 5;
      await markJob(job.id, terminal ? 'dead' : 'queued', attempts, String(err?.message || err));
      failed += 1;
    }
  }
  await repairSparseBlocks(3).catch(() => {});
  return { scanned: jobs.length, ok, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHydrationBatch(Number(process.argv[2] || 25))
    .then((out) => {
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[hydrate-worker] failed', err?.message || err);
      process.exit(1);
    });
}

