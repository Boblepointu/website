import { sql } from '../db/client.js';
import { publishEvent } from '../events/bus.js';
import { decodeRankFromOpReturnHex } from '../rank/decode.js';

function nowMs() {
  return Date.now();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dayBucketTs(unixSeconds) {
  const ms = Number(unixSeconds || 0) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function snapshotBucketTs(unixSeconds) {
  const s = Number(unixSeconds || 0);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.floor(s / 300) * 300; // 5-minute buckets
}

function txidOf(tx) {
  return String(tx?.txid || tx?.txId || tx?.hash || '');
}

function outputScriptHex(output) {
  return String(output?.outputScript || output?.script || output?.scriptHex || '').toLowerCase();
}

function detectOpReturnHex(output) {
  const hex = outputScriptHex(output);
  return hex.startsWith('6a') ? hex : '';
}

function txOutputs(tx) {
  if (Array.isArray(tx?.outputs)) return tx.outputs;
  if (Array.isArray(tx?.vout)) return tx.vout;
  return [];
}

function txInputs(tx) {
  if (Array.isArray(tx?.inputs)) return tx.inputs;
  if (Array.isArray(tx?.vin)) return tx.vin;
  return [];
}

function ingestMode() {
  return String(process.env.BACKFILL_MODE || 'full').trim().toLowerCase();
}

function isCoreIngestMode() {
  return ingestMode() === 'core';
}

function envFlag(name, fallback) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
}

function shouldProjectAddresses() {
  return envFlag('BACKFILL_WITH_ADDRESS', !isCoreIngestMode());
}

function shouldProjectSocial() {
  return envFlag('BACKFILL_WITH_SOCIAL', !isCoreIngestMode());
}

function shouldProjectSnapshots() {
  return envFlag('BACKFILL_WITH_SNAPSHOTS', !isCoreIngestMode());
}

function rawJsonPolicy() {
  const mode = String(process.env.BACKFILL_RAW_JSON || '').trim().toLowerCase();
  if (mode === 'none' || mode === 'minimal' || mode === 'full') return mode;
  return isCoreIngestMode() ? 'none' : 'full';
}

function minimalBlockRaw(block) {
  const info = block?.blockInfo || {};
  return {
    blockInfo: {
      height: toNumber(info.height, 0),
      hash: String(info.hash || ''),
      prevHash: String(info.prevHash || ''),
      timestamp: toNumber(info.timestamp || 0),
      numTxs: toNumber(info.numTxs || 0),
      blockSize: toNumber(info.blockSize || 0)
    }
  };
}

function minimalTxRaw(tx) {
  return {
    txid: txidOf(tx),
    size: toNumber(tx?.size || tx?.txSize || 0),
    version: toNumber(tx?.version || 0),
    lockTime: toNumber(tx?.lockTime || tx?.locktime || 0),
    inputCount: txInputs(tx).length,
    outputCount: txOutputs(tx).length
  };
}

function serializeRawPayload(kind, value) {
  const policy = rawJsonPolicy();
  if (policy === 'none') return '{}';
  if (policy === 'minimal') {
    const compact = kind === 'block' ? minimalBlockRaw(value) : minimalTxRaw(value);
    return JSON.stringify(compact);
  }
  return JSON.stringify(value || {});
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;
}

function batchSizeFor(kind, txCount = 0) {
  const isLargeBlock = Number(txCount || 0) >= 1000;
  const isCore = isCoreIngestMode();
  if (kind === 'prevout') {
    const base = envInt('BACKFILL_PREVOUT_CHUNK_SIZE', isCore ? 240 : 120);
    return Math.min(800, isLargeBlock ? base * 2 : base);
  }
  const envName = kind === 'delta' ? 'BACKFILL_DELTA_CHUNK_SIZE' : 'BACKFILL_SQL_CHUNK_SIZE';
  const base = envInt(envName, isCore ? 420 : 200);
  return Math.min(1200, isLargeBlock ? base * 2 : base);
}

function chunkRows(rows, size = 200) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function placeholders(cols, rowCount) {
  return Array.from({ length: rowCount }, () => `(${Array(cols).fill('?').join(', ')})`).join(', ');
}

async function insertManyTxInputs(rows, txCount = 0) {
  if (!rows.length) return;
  for (const chunk of chunkRows(rows, batchSizeFor('sql', txCount))) {
    const flat = chunk.flat();
    await sql(
      `INSERT OR REPLACE INTO tx_inputs(txid, vin, prev_txid, prev_vout, coinbase_hex, sequence, script_sig)
       VALUES ${placeholders(7, chunk.length)}`,
      ...flat
    );
  }
}

async function insertManyTxOutputs(rows, txCount = 0) {
  if (!rows.length) return;
  for (const chunk of chunkRows(rows, batchSizeFor('sql', txCount))) {
    const flat = chunk.flat();
    await sql(
      `INSERT OR REPLACE INTO tx_outputs(txid, vout, value_sats, script_hex, script_type, address, op_return_hex)
       VALUES ${placeholders(7, chunk.length)}`,
      ...flat
    );
  }
}

async function insertManyAddresses(rows, txCount = 0) {
  if (!rows.length) return;
  for (const chunk of chunkRows(rows, batchSizeFor('sql', txCount))) {
    const flat = chunk.flat();
    await sql(
      `INSERT OR REPLACE INTO addresses(address, txid, vout, value_sats, block_height, block_time, direction)
       VALUES ${placeholders(7, chunk.length)}`,
      ...flat
    );
  }
}

function addAddressDelta(deltaMap, address, balanceDelta = 0, receivedDelta = 0) {
  if (!address) return;
  const key = String(address);
  const prev = deltaMap.get(key) || { balance: 0, received: 0 };
  prev.balance += Number(balanceDelta || 0);
  prev.received += Number(receivedDelta || 0);
  deltaMap.set(key, prev);
}

const PREVOUT_CACHE_MAX = 250000;
const prevoutCache = new Map();

function prevoutKey(txid, vout) {
  return `${String(txid)}:${Number(vout)}`;
}

function cachePrevout(txid, vout, row) {
  prevoutCache.set(prevoutKey(txid, vout), row);
  if (prevoutCache.size > PREVOUT_CACHE_MAX) {
    const firstKey = prevoutCache.keys().next().value;
    if (firstKey) prevoutCache.delete(firstKey);
  }
}

async function fetchPrevOutputsBatch(refs, txCount = 0) {
  const want = new Map();
  for (const r of refs) {
    const txid = String(r?.txid || '');
    const vout = Number(r?.vout);
    if (!txid || !Number.isFinite(vout) || vout < 0) continue;
    want.set(prevoutKey(txid, vout), { txid, vout: Math.trunc(vout) });
  }
  if (want.size === 0) return new Map();

  const out = new Map();
  const misses = [];
  for (const [key, ref] of want.entries()) {
    const hit = prevoutCache.get(key);
    if (hit) out.set(key, hit);
    else misses.push(ref);
  }

  for (const chunk of chunkRows(misses, batchSizeFor('prevout', txCount))) {
    const where = chunk.map(() => '(txid = ? AND vout = ?)').join(' OR ');
    const params = chunk.flatMap((r) => [r.txid, r.vout]);
    const rows = await sql(
      `SELECT txid, vout, address, value_sats
       FROM tx_outputs
       WHERE ${where}`,
      ...params
    );
    for (const row of rows || []) {
      const key = prevoutKey(row?.txid, row?.vout);
      const normalized = {
        txid: String(row?.txid || ''),
        vout: toNumber(row?.vout, -1),
        address: String(row?.address || ''),
        value_sats: toNumber(row?.value_sats, 0)
      };
      cachePrevout(normalized.txid, normalized.vout, normalized);
      out.set(key, normalized);
    }
  }
  return out;
}

async function applyAddressDeltasBatch(deltaMap, txCount = 0) {
  const entries = Array.from(deltaMap.entries());
  if (!entries.length) return;
  const now = nowMs();

  const balanceRows = entries.map(([address, delta]) => [address, Math.trunc(delta.balance), now]);
  for (const chunk of chunkRows(balanceRows, batchSizeFor('delta', txCount))) {
    const flat = chunk.flat();
    await sql(
      `INSERT INTO address_balances(address, balance_sats, updated_at)
       VALUES ${placeholders(3, chunk.length)}
       ON CONFLICT(address) DO UPDATE SET
         balance_sats = CASE
           WHEN balance_sats + excluded.balance_sats < 0 THEN 0
           ELSE balance_sats + excluded.balance_sats
         END,
         updated_at = excluded.updated_at`,
      ...flat
    );
  }

  const receivedRows = entries
    .map(([address, delta]) => [address, Math.trunc(delta.received), now])
    .filter((r) => r[1] > 0);
  for (const chunk of chunkRows(receivedRows, batchSizeFor('delta', txCount))) {
    const flat = chunk.flat();
    await sql(
      `INSERT INTO address_received(address, received_sats, updated_at)
       VALUES ${placeholders(3, chunk.length)}
       ON CONFLICT(address) DO UPDATE SET
         received_sats = received_sats + excluded.received_sats,
         updated_at = excluded.updated_at`,
      ...flat
    );
  }
}

async function insertManyDomainEventDims(rows) {
  if (!rows.length) return;
  for (const chunk of chunkRows(rows, 300)) {
    await sql(
      `INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value)
       VALUES ${placeholders(3, chunk.length)}`,
      ...chunk.flat()
    );
  }
}

async function insertManyDomainEntityDims(rows) {
  if (!rows.length) return;
  for (const chunk of chunkRows(rows, 300)) {
    await sql(
      `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value)
       VALUES ${placeholders(3, chunk.length)}`,
      ...chunk.flat()
    );
  }
}

function rankFromStructuredOutput(output) {
  const r = output?.rankOutput;
  if (!r || typeof r !== 'object') return null;
  const profileId = String(r.profileId || '').trim();
  const postId = String(r.postId || '').trim();
  if (!/^[a-z0-9_]{3,32}$/i.test(profileId)) return null;
  if (postId && !/^[0-9]{15,20}$/.test(postId)) return null;
  const sentimentRaw = String(r.sentiment || 'neutral').toLowerCase();
  const sentiment = sentimentRaw === 'positive' || sentimentRaw === 'negative' ? sentimentRaw : 'neutral';
  return {
    protocolId: 'rank',
    protocolVersion: 'v1',
    valid: 1,
    sentiment,
    platform: 'twitter',
    profileId,
    postId,
    entityType: 'vote',
    entityKey: `${profileId}:${postId || ''}`,
    burnSats: 0,
    payloadHex: ''
  };
}

async function upsertChainStatsSnapshot(info) {
  const ts = snapshotBucketTs(info.timestamp || info.time || 0);
  if (!ts) return;
  const blockHeight = toNumber(info.height, 0);
  const blockHash = String(info.hash || '');
  const hashrate = toNumber(info.networkHashrate || info.networkhashps || info.hashrate || 0, 0);
  const difficulty = toNumber(info.difficulty || 0, 0);
  const mempoolCount = toNumber(info.mempoolCount || info.mempoolTxs || 0, 0);
  const mempoolBytes = toNumber(info.mempoolBytes || info.mempoolSize || 0, 0);
  await sql(
    `INSERT OR REPLACE INTO chain_stats_snapshots(
      snapshot_ts, block_height, block_hash, hashrate, difficulty, mempool_count, mempool_bytes, created_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    ts,
    blockHeight,
    blockHash,
    hashrate,
    difficulty,
    mempoolCount,
    mempoolBytes,
    nowMs()
  );
  await sql(
    `INSERT OR REPLACE INTO mempool_snapshots(snapshot_ts, tx_count, total_bytes, created_at)
     VALUES(?, ?, ?, ?)`,
    ts,
    mempoolCount,
    mempoolBytes,
    nowMs()
  );
}

async function upsertSupplyStats(info) {
  const dayTs = dayBucketTs(info.timestamp || info.time || 0);
  if (!dayTs) return;
  const minted = toNumber(info.reward || info.blockReward || info.subsidy || 0, 0);
  const burned = toNumber(info.numBurnedSats || info.burnedSats || 0, 0);
  const prev = await sql(
    `SELECT day_ts, total_supply_sats, circulating_sats
     FROM supply_stats_daily
     ORDER BY day_ts DESC
     LIMIT 1`
  );
  const prevTotal = toNumber(prev?.[0]?.total_supply_sats, 0);
  const total = Math.max(0, prevTotal + minted - burned);
  const circulating = total;
  const inflationBps = prevTotal > 0 ? Math.round((minted * 10000) / prevTotal) : 0;
  await sql(
    `INSERT INTO supply_stats_daily(
      day_ts, issued_sats, burned_sats, total_supply_sats, circulating_sats, inflation_bps, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day_ts) DO UPDATE SET
      issued_sats = issued_sats + excluded.issued_sats,
      burned_sats = burned_sats + excluded.burned_sats,
      total_supply_sats = excluded.total_supply_sats,
      circulating_sats = excluded.circulating_sats,
      inflation_bps = excluded.inflation_bps,
      updated_at = excluded.updated_at`,
    dayTs,
    minted,
    burned,
    total,
    circulating,
    inflationBps,
    nowMs(),
    nowMs()
  );
}

async function applyAddressDelta(address, balanceDelta, receivedDelta) {
  if (!address) return;
  const now = nowMs();
  await sql(
    `INSERT INTO address_balances(address, balance_sats, updated_at)
     VALUES(?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       balance_sats = CASE
         WHEN balance_sats + excluded.balance_sats < 0 THEN 0
         ELSE balance_sats + excluded.balance_sats
       END,
       updated_at = excluded.updated_at`,
    address,
    balanceDelta,
    now
  );
  if (receivedDelta > 0) {
    await sql(
      `INSERT INTO address_received(address, received_sats, updated_at)
       VALUES(?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         received_sats = received_sats + excluded.received_sats,
         updated_at = excluded.updated_at`,
      address,
      receivedDelta,
      now
    );
  }
}

async function upsertBlock(block) {
  const info = block?.blockInfo || block || {};
  const height = toNumber(info.height, -1);
  const hash = String(info.hash || '');
  if (height < 0 || !hash) return null;
  const blockTime = toNumber(info.timestamp || info.time || 0, 0);
  await sql(
    `INSERT OR REPLACE INTO blocks(height, hash, prev_hash, time, size, n_tx, difficulty, raw_json, indexed_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    height,
    hash,
    String(info.prevHash || ''),
    blockTime,
    toNumber(info.blockSize || info.size || 0),
    toNumber(info.numTxs || info.nTx || 0),
    String(info.difficulty || ''),
    serializeRawPayload('block', block),
    nowMs()
  );
  if (shouldProjectSnapshots()) {
    await upsertChainStatsSnapshot(info);
    await upsertSupplyStats(info);
  }
  return { height, hash, blockTime };
}

async function upsertTransaction(meta, tx, blockTxCount = 0) {
  const txid = txidOf(tx);
  if (!txid) return null;
  await sql(
    `INSERT OR REPLACE INTO transactions(txid, block_height, block_hash, block_time, size, locktime, version, raw_json)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    txid,
    meta.height,
    meta.hash,
    meta.blockTime,
    toNumber(tx?.size || tx?.txSize || 0),
    toNumber(tx?.lockTime || tx?.locktime || 0),
    toNumber(tx?.version || 0),
    serializeRawPayload('tx', tx)
  );

  const ins = txInputs(tx);
  const inputRows = [];
  const inputPrevRefs = [];
  const addressRows = [];
  const deltaMap = new Map();
  for (let i = 0; i < ins.length; i += 1) {
    const vin = ins[i] || {};
    const prevTxid = String(vin?.prevOut?.txid || vin?.txid || '');
    const prevVout = toNumber(vin?.prevOut?.outIdx ?? vin?.vout ?? -1, -1);
    inputRows.push([
      txid,
      i,
      prevTxid,
      prevVout,
      String(vin?.coinbase || ''),
      toNumber(vin?.sequence || 0),
      String(vin?.inputScript || vin?.scriptSig?.hex || '')
    ]);
    if (shouldProjectAddresses() && prevTxid && prevVout >= 0 && !vin?.coinbase) {
      inputPrevRefs.push({ txid: prevTxid, vout: prevVout, vin: i });
    }
  }
  await insertManyTxInputs(inputRows, blockTxCount);
  if (shouldProjectAddresses()) {
    const prevLookup = await fetchPrevOutputsBatch(inputPrevRefs, blockTxCount);
    for (const ref of inputPrevRefs) {
      const row = prevLookup.get(prevoutKey(ref.txid, ref.vout));
      const prevAddress = String(row?.address || '');
      const prevValue = toNumber(row?.value_sats, 0);
      if (!prevAddress || prevValue <= 0) continue;
      addressRows.push([
        prevAddress,
        txid,
        -1 - ref.vin,
        prevValue,
        meta.height,
        meta.blockTime,
        'out'
      ]);
      addAddressDelta(deltaMap, prevAddress, -prevValue, 0);
    }
  }

  const outs = txOutputs(tx);
  const outputRows = [];
  for (let i = 0; i < outs.length; i += 1) {
    const out = outs[i] || {};
    const sats = toNumber(out?.value || out?.sats || 0, 0);
    const scriptHex = outputScriptHex(out);
    const opReturnHex = detectOpReturnHex(out);
    const address =
      String(
        out?.scriptPubKey?.addresses?.[0] ||
          out?.address ||
          out?.outputScriptAddress ||
          ''
      ) || null;
    outputRows.push([
      txid,
      i,
      sats,
      scriptHex,
      String(out?.scriptPubKey?.type || out?.type || ''),
      address,
      opReturnHex
    ]);
    if (shouldProjectAddresses() && address) {
      addressRows.push([
        address,
        txid,
        i,
        sats,
        meta.height,
        meta.blockTime,
        'in'
      ]);
      addAddressDelta(deltaMap, address, sats, sats);
    }
  }
  await insertManyTxOutputs(outputRows, blockTxCount);
  if (shouldProjectAddresses()) {
    await insertManyAddresses(addressRows, blockTxCount);
    await applyAddressDeltasBatch(deltaMap, blockTxCount);
  }

  await publishEvent('chain.tx.extracted', txid, {
    txid,
    blockHeight: meta.height,
    blockHash: meta.hash
  });
  return txid;
}

async function upsertProtocolEvents(meta, tx) {
  const txid = txidOf(tx);
  if (!txid) return;
  const outs = txOutputs(tx);
  for (let i = 0; i < outs.length; i += 1) {
    const out = outs[i] || {};
    const opReturnHex = detectOpReturnHex(out);
    if (!opReturnHex) continue;

    const rank = rankFromStructuredOutput(out) || decodeRankFromOpReturnHex(opReturnHex);
    const protocolId = rank ? 'rank' : 'unknown';
    const payload = rank || { opReturnHex };
    const eventKey = `${txid}:${i}:${protocolId}`;

    await sql(
      `INSERT OR IGNORE INTO protocol_registry(protocol_id, display_name, version, enabled, created_at, updated_at)
       VALUES(?, ?, ?, 1, ?, ?)`,
      protocolId,
      protocolId === 'rank' ? 'RANK Protocol' : 'Unknown Protocol',
      rank?.protocolVersion || 'v1',
      nowMs(),
      nowMs()
    );

    await sql(
      `INSERT OR REPLACE INTO protocol_events(
        event_key, protocol_id, protocol_version, txid, vout, block_height, block_time,
        entity_type, entity_key, op_return_hex, payload_json, valid, discovered_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      eventKey,
      protocolId,
      rank?.protocolVersion || null,
      txid,
      i,
      meta.height,
      meta.blockTime,
      rank?.entityType || null,
      rank?.entityKey || null,
      opReturnHex,
      JSON.stringify(payload),
      rank?.valid ? 1 : 0,
      nowMs()
    );

    await publishEvent('protocol.event.detected', protocolId, {
      eventKey,
      protocolId,
      txid,
      vout: i,
      blockHeight: meta.height
    });

    if (rank?.valid) {
      await upsertDomainProjection(meta, txid, rank, out);
    }
  }
}

async function upsertDomainProjection(meta, txid, rank, out) {
  const platform = String(rank.platform || '');
  const profileId = String(rank.profileId || '');
  const postId = String(rank.postId || '');
  if (!platform || !profileId) return;
  const sats = String(toNumber(out?.value || out?.sats || rank.burnSats || 0));
  const isPositive = String(rank.sentiment || '').toLowerCase() === 'positive';
  const isNegative = String(rank.sentiment || '').toLowerCase() === 'negative';
  const now = nowMs();

  const domain = 'social';
  const protocol = 'rank';
  const direction = isPositive ? 'in' : isNegative ? 'out' : 'neutral';
  const profileEntityId = `${domain}:profile:${protocol}:${platform}:${profileId}`;
  const postEntityId = `${domain}:post:${protocol}:${platform}:${profileId}:${postId || ''}`;

  await sql(
    `INSERT OR REPLACE INTO domain_events(
      event_id, domain, activity_type, source_protocol, txid, block_height, block_time,
      direction, amount_text, payload_json, context_json, created_at
    ) VALUES(?, ?, 'vote', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    txid,
    domain,
    protocol,
    txid,
    meta.height,
    meta.blockTime,
    direction,
    sats,
    JSON.stringify(rank),
    JSON.stringify({ platform, profile_id: profileId, post_id: postId || '' }),
    now
  );
  const eventDimRows = [
    [txid, 'platform', platform],
    [txid, 'profile_id', profileId]
  ];
  if (postId) eventDimRows.push([txid, 'post_id', postId]);
  await insertManyDomainEventDims(eventDimRows);

  await sql(
    `INSERT OR IGNORE INTO domain_entities(
      entity_id, domain, object_type, source_protocol, score, amount_in, amount_out, count_in, count_out, identity_json, state_json, updated_at
    ) VALUES(?, ?, 'profile', ?, '0', '0', '0', 0, 0, ?, '{}', ?)`,
    profileEntityId,
    domain,
    protocol,
    JSON.stringify({ platform, profile_id: profileId }),
    now
  );
  await insertManyDomainEntityDims([
    [profileEntityId, 'platform', platform],
    [profileEntityId, 'profile_id', profileId]
  ]);
  await sql(
    `UPDATE domain_entities
     SET amount_in = CAST(amount_in AS INTEGER) + ?,
         amount_out = CAST(amount_out AS INTEGER) + ?,
         count_in = count_in + ?,
         count_out = count_out + ?,
         score = CAST(CAST(amount_in AS INTEGER) + ? - (CAST(amount_out AS INTEGER) + ?) AS TEXT),
         updated_at = ?
     WHERE entity_id = ?`,
    isPositive ? sats : '0',
    isNegative ? sats : '0',
    isPositive ? 1 : 0,
    isNegative ? 1 : 0,
    isPositive ? sats : '0',
    isNegative ? sats : '0',
    now,
    profileEntityId
  );

  if (!postId) return;
  await sql(
    `INSERT OR IGNORE INTO domain_entities(
      entity_id, domain, object_type, source_protocol, score, amount_in, amount_out, count_in, count_out, identity_json, state_json, updated_at
    ) VALUES(?, ?, 'post', ?, '0', '0', '0', 0, 0, ?, '{}', ?)`,
    postEntityId,
    domain,
    protocol,
    JSON.stringify({ platform, profile_id: profileId, post_id: postId }),
    now
  );
  await insertManyDomainEntityDims([
    [postEntityId, 'platform', platform],
    [postEntityId, 'profile_id', profileId],
    [postEntityId, 'post_id', postId]
  ]);
  await sql(
    `UPDATE domain_entities
     SET amount_in = CAST(amount_in AS INTEGER) + ?,
         amount_out = CAST(amount_out AS INTEGER) + ?,
         count_in = count_in + ?,
         count_out = count_out + ?,
         score = CAST(CAST(amount_in AS INTEGER) + ? - (CAST(amount_out AS INTEGER) + ?) AS TEXT),
         updated_at = ?
     WHERE entity_id = ?`,
    isPositive ? sats : '0',
    isNegative ? sats : '0',
    isPositive ? 1 : 0,
    isNegative ? 1 : 0,
    isPositive ? sats : '0',
    isNegative ? sats : '0',
    now,
    postEntityId
  );
}

async function indexBlockInternal(block) {
  const meta = await upsertBlock(block);
  if (!meta) return null;
  await publishEvent('chain.block.fetched', String(meta.height), {
    height: meta.height,
    hash: meta.hash
  });

  const txs = Array.isArray(block?.txs) ? block.txs : [];
  const blockTxCount = txs.length;
  for (const tx of txs) {
    const txid = await upsertTransaction(meta, tx, blockTxCount);
    if (!txid) continue;
    if (shouldProjectSocial()) {
      await upsertProtocolEvents(meta, tx);
    }
  }
  return meta;
}

export async function indexBlock(block) {
  await sql('BEGIN IMMEDIATE');
  try {
    const meta = await indexBlockInternal(block);
    await sql('COMMIT');
    return meta;
  } catch (err) {
    await sql('ROLLBACK').catch(() => {});
    throw err;
  }
}

export async function indexBlocksBatch(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length === 0) return [];
  await sql('BEGIN IMMEDIATE');
  try {
    const metas = [];
    for (const block of list) {
      const meta = await indexBlockInternal(block);
      if (meta) metas.push(meta);
    }
    await sql('COMMIT');
    return metas;
  } catch (err) {
    await sql('ROLLBACK').catch(() => {});
    throw err;
  }
}

