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
    JSON.stringify(block || {}),
    nowMs()
  );
  await upsertChainStatsSnapshot(info);
  await upsertSupplyStats(info);
  return { height, hash, blockTime };
}

async function upsertTransaction(meta, tx) {
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
    JSON.stringify(tx || {})
  );

  const ins = txInputs(tx);
  for (let i = 0; i < ins.length; i += 1) {
    const vin = ins[i] || {};
    const prevTxid = String(vin?.prevOut?.txid || vin?.txid || '');
    const prevVout = toNumber(vin?.prevOut?.outIdx ?? vin?.vout ?? -1, -1);
    await sql(
      `INSERT OR REPLACE INTO tx_inputs(txid, vin, prev_txid, prev_vout, coinbase_hex, sequence, script_sig)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      txid,
      i,
      prevTxid,
      prevVout,
      String(vin?.coinbase || ''),
      toNumber(vin?.sequence || 0),
      String(vin?.inputScript || vin?.scriptSig?.hex || '')
    );
    if (prevTxid && prevVout >= 0 && !vin?.coinbase) {
      const prevRows = await sql(
        `SELECT address, value_sats FROM tx_outputs WHERE txid = ? AND vout = ? LIMIT 1`,
        prevTxid,
        prevVout
      );
      const prevAddress = String(prevRows?.[0]?.address || '');
      const prevValue = toNumber(prevRows?.[0]?.value_sats, 0);
      if (prevAddress && prevValue > 0) {
        await sql(
          `INSERT OR REPLACE INTO addresses(address, txid, vout, value_sats, block_height, block_time, direction)
           VALUES(?, ?, ?, ?, ?, ?, 'out')`,
          prevAddress,
          txid,
          -1 - i,
          prevValue,
          meta.height,
          meta.blockTime
        );
        await applyAddressDelta(prevAddress, -prevValue, 0);
      }
    }
  }

  const outs = txOutputs(tx);
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
    await sql(
      `INSERT OR REPLACE INTO tx_outputs(txid, vout, value_sats, script_hex, script_type, address, op_return_hex)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      txid,
      i,
      sats,
      scriptHex,
      String(out?.scriptPubKey?.type || out?.type || ''),
      address,
      opReturnHex
    );
    if (address) {
      await sql(
        `INSERT OR REPLACE INTO addresses(address, txid, vout, value_sats, block_height, block_time, direction)
         VALUES(?, ?, ?, ?, ?, ?, 'in')`,
        address,
        txid,
        i,
        sats,
        meta.height,
        meta.blockTime
      );
      await applyAddressDelta(address, sats, sats);
    }
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
  await sql(
    `INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value) VALUES(?, 'platform', ?)`,
    txid,
    platform
  );
  await sql(
    `INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value) VALUES(?, 'profile_id', ?)`,
    txid,
    profileId
  );
  if (postId) {
    await sql(
      `INSERT OR REPLACE INTO domain_event_dims(event_id, dim_key, dim_value) VALUES(?, 'post_id', ?)`,
      txid,
      postId
    );
  }

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
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'platform', ?)`,
    profileEntityId,
    platform
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'profile_id', ?)`,
    profileEntityId,
    profileId
  );
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
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'platform', ?)`,
    postEntityId,
    platform
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'profile_id', ?)`,
    postEntityId,
    profileId
  );
  await sql(
    `INSERT OR REPLACE INTO domain_entity_dims(entity_id, dim_key, dim_value) VALUES(?, 'post_id', ?)`,
    postEntityId,
    postId
  );
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

export async function indexBlock(block) {
  const meta = await upsertBlock(block);
  if (!meta) return null;
  await publishEvent('chain.block.fetched', String(meta.height), {
    height: meta.height,
    hash: meta.hash
  });

  const txs = Array.isArray(block?.txs) ? block.txs : [];
  for (const tx of txs) {
    const txid = await upsertTransaction(meta, tx);
    if (!txid) continue;
    await upsertProtocolEvents(meta, tx);
  }
  return meta;
}

