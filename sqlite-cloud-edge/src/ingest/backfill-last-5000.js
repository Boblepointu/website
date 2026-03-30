import { closeDb, sql } from '../db/client.js';
import { config } from '../config.js';
import { indexBlock, indexBlocksBatch } from './index-block.js';
import { ChronikClient } from 'chronik-client';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function countShardHeights(start, end, shardIndex, shardCount) {
  const first = start + shardIndex;
  if (first > end) return 0;
  return Math.floor((end - first) / shardCount) + 1;
}

async function loadIndexedHeights(start, end, shardCount = 1, shardIndex = 0) {
  const rows = await sql(
    `SELECT DISTINCT b.height AS h
     FROM blocks b
     WHERE b.height BETWEEN ? AND ?
       AND ((b.height - ?) % ?) = ?
       AND EXISTS (
         SELECT 1
         FROM transactions t
         WHERE t.block_height = b.height
       )`,
    start,
    end
    ,
    start,
    shardCount,
    shardIndex
  );
  const set = new Set();
  for (const row of rows) {
    const h = toInt(row?.h, -1);
    if (h >= start && h <= end) set.add(h);
  }
  return set;
}

function hasTxs(block) {
  return Array.isArray(block?.txs) && block.txs.length > 0;
}

let chronikClient = null;

function chronikBase() {
  const envValue = String(process.env.CHRONIK_BASE_URL || '').trim();
  if (envValue) return envValue.replace(/\/+$/, '');
  return 'https://chronik.lotusia.org';
}

function getChronikClient() {
  if (chronikClient) return chronikClient;
  chronikClient = new ChronikClient(chronikBase());
  return chronikClient;
}

function toSats(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function normalizeChronikTx(tx) {
  const inputs = Array.isArray(tx?.inputs) ? tx.inputs : [];
  const outputs = Array.isArray(tx?.outputs) ? tx.outputs : [];
  return {
    txid: String(tx?.txid || ''),
    size: toInt(tx?.size || 0),
    lockTime: toInt(tx?.lockTime || 0),
    version: toInt(tx?.version || 0),
    inputs: inputs.map((vin) => ({
      prevOut: {
        txid: String(vin?.prevOut?.txid || ''),
        outIdx: toInt(vin?.prevOut?.outIdx ?? -1, -1)
      },
      coinbase: tx?.isCoinbase ? String(vin?.inputScript || '') : '',
      sequence: toInt(vin?.sequenceNo || 0),
      inputScript: String(vin?.inputScript || '')
    })),
    outputs: outputs.map((vout) => ({
      value: toSats(vout?.value),
      outputScript: String(vout?.outputScript || ''),
      address: String(vout?.address || '')
    }))
  };
}

function normalizeChronikBlock(block) {
  const info = block?.blockInfo || {};
  const txs = Array.isArray(block?.txs) ? block.txs : [];
  return {
    blockInfo: {
      height: toInt(info?.height || 0),
      hash: String(info?.hash || ''),
      prevHash: String(info?.prevHash || ''),
      timestamp: toInt(info?.timestamp || 0),
      blockSize: toInt(info?.blockSize || 0),
      numTxs: toInt(info?.numTxs || txs.length, txs.length),
      numBurnedSats: toInt(info?.sumBurnedSats || 0)
    },
    txs: txs.map(normalizeChronikTx)
  };
}

async function fetchChronikBlock(heightOrHash) {
  const chronik = getChronikClient();
  const raw = await chronik.block(heightOrHash);
  const normalized = normalizeChronikBlock(raw);
  if (!hasTxs(normalized)) throw new Error('chronik_block_missing_txs');
  return normalized;
}

function explorerBase() {
  return (config.explorerFallbackBase || 'https://explorer.lotusia.org').replace(/\/+$/, '');
}

function snapshotBucketTs(unixSeconds) {
  const s = Number(unixSeconds || 0);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.floor(s / 300) * 300;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getTipHeight() {
  try {
    const chronik = getChronikClient();
    const info = await chronik.blockchainInfo();
    const tip = toInt(info?.tipHeight ?? 0, 0);
    if (tip > 0) return tip;
  } catch (_) {}

  const base = explorerBase();
  const raw = await fetchJson(`${base}/api/getblockcount`);
  const tip = toInt(raw, 0);
  if (tip <= 0) throw new Error('Unable to resolve tip height from Chronik and explorer fallback');
  return tip;
}

async function getExplorerBlockHashByHeight(height) {
  const base = explorerBase();
  const raw = await fetchJson(`${base}/api/getblockhash?index=${encodeURIComponent(String(height))}`);
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object' && raw.hash) return String(raw.hash);
  return '';
}

async function fetchExplorerRawBlock(hashOrHeight) {
  const base = explorerBase();
  return fetchJson(`${base}/api/getblock?hash=${encodeURIComponent(String(hashOrHeight))}`);
}

async function fetchExplorerRawTx(txid) {
  const base = explorerBase();
  return fetchJson(`${base}/api/getrawtransaction?txid=${encodeURIComponent(String(txid))}&decrypt=1`);
}

async function upsertPeerSnapshots(peers, capturedAtMs = Date.now()) {
  const list = Array.isArray(peers) ? peers : [];
  for (const p of list) {
    const addr = String(p?.addr || p?.address || '').trim();
    if (!addr) continue;
    const peerId = `${capturedAtMs}:${addr}`;
    await sql(
      `INSERT OR REPLACE INTO peer_snapshots(
         peer_id, captured_at, address, subver, protocol_version, synced_blocks, country_code, country_name, addnode_line, onetry_line
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      peerId,
      capturedAtMs,
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

async function materializeNetworkSnapshot() {
  const base = explorerBase();
  try {
    const overview = await fetchJson(`${base}/api/explorer/overview`).catch(() => null);
    const peersFromOverview = Array.isArray(overview?.peerinfo) ? overview.peerinfo : [];
    if (peersFromOverview.length > 0) {
      await upsertPeerSnapshots(peersFromOverview, Date.now());
      return peersFromOverview.length;
    }
    const peerInfo = await fetchJson(`${base}/api/getpeerinfo`);
    const peers = Array.isArray(peerInfo) ? peerInfo : [];
    await upsertPeerSnapshots(peers, Date.now());
    return peers.length;
  } catch (_) {
    return 0;
  }
}

async function materializeRichlistSnapshots(snapshotTsSec = 0, topN = 250) {
  const ts = snapshotTsSec > 0 ? snapshotTsSec : snapshotBucketTs(Math.floor(Date.now() / 1000));
  if (!ts) return { balance: 0, received: 0 };
  const snapshotId = String(ts);
  const nowMs = Date.now();
  const limit = Math.max(25, Math.min(2000, Number(topN || 250)));

  const totalBalRows = await sql(`SELECT COALESCE(SUM(balance_sats), 0) AS total FROM address_balances`);
  const totalBal = toNum(totalBalRows?.[0]?.total, 0);
  const balRows = await sql(
    `SELECT address, balance_sats
     FROM address_balances
     ORDER BY balance_sats DESC, address ASC
     LIMIT ?`,
    limit
  );
  for (let i = 0; i < balRows.length; i += 1) {
    const r = balRows[i];
    const valueSats = toInt(r?.balance_sats, 0);
    const pct = totalBal > 0 ? Number((valueSats / totalBal) * 100) : 0;
    await sql(
      `INSERT OR REPLACE INTO richlist_snapshots(snapshot_id, kind, rank, address, value_sats, pct, created_at)
       VALUES(?, 'balance', ?, ?, ?, ?, ?)`,
      snapshotId,
      i + 1,
      String(r?.address || ''),
      valueSats,
      pct,
      nowMs
    );
  }

  const totalRecvRows = await sql(`SELECT COALESCE(SUM(received_sats), 0) AS total FROM address_received`);
  const totalRecv = toNum(totalRecvRows?.[0]?.total, 0);
  const recvRows = await sql(
    `SELECT address, received_sats
     FROM address_received
     ORDER BY received_sats DESC, address ASC
     LIMIT ?`,
    limit
  );
  for (let i = 0; i < recvRows.length; i += 1) {
    const r = recvRows[i];
    const valueSats = toInt(r?.received_sats, 0);
    const pct = totalRecv > 0 ? Number((valueSats / totalRecv) * 100) : 0;
    await sql(
      `INSERT OR REPLACE INTO richlist_snapshots(snapshot_id, kind, rank, address, value_sats, pct, created_at)
       VALUES(?, 'received', ?, ?, ?, ?, ?)`,
      snapshotId,
      i + 1,
      String(r?.address || ''),
      valueSats,
      pct,
      nowMs
    );
  }

  return { balance: balRows.length, received: recvRows.length };
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
    txid: String(raw?.txid || ''),
    size: toInt(raw?.size ?? raw?.vsize ?? 0),
    lockTime: toInt(raw?.locktime ?? 0),
    version: toInt(raw?.version ?? 0),
    inputs: vin.map((i) => ({
      prevOut: {
        txid: String(i?.txid || ''),
        outIdx: toInt(i?.vout ?? -1, -1)
      },
      coinbase: String(i?.coinbase || ''),
      sequence: toInt(i?.sequence ?? 0),
      inputScript: String(i?.scriptSig?.hex || '')
    })),
    outputs: vout.map((o) => ({
      value: valueToSats(o?.value),
      outputScript: String(o?.scriptPubKey?.hex || ''),
      scriptPubKey: {
        type: String(o?.scriptPubKey?.type || ''),
        addresses: Array.isArray(o?.scriptPubKey?.addresses) ? o.scriptPubKey.addresses : []
      },
      address: Array.isArray(o?.scriptPubKey?.addresses) ? String(o.scriptPubKey.addresses[0] || '') : '',
      rankOutput: o?.rankOutput || null
    }))
  };
}

async function buildIndexableBlockFromExplorer(height, knownHash = '') {
  let hash = knownHash || '';
  if (!hash) hash = await getExplorerBlockHashByHeight(height);
  const rawBlock = await fetchExplorerRawBlock(hash || height);
  const txids = Array.isArray(rawBlock?.tx) ? rawBlock.tx : [];
  const txs = [];
  for (const txid of txids) {
    try {
      const rawTx = await fetchExplorerRawTx(txid);
      txs.push(normalizeExplorerTx(rawTx));
    } catch (_) {}
  }
  return {
    blockInfo: {
      height: toInt(rawBlock?.height ?? height, height),
      hash: String(rawBlock?.hash || hash || ''),
      prevHash: String(rawBlock?.previousblockhash || ''),
      timestamp: toInt(rawBlock?.time ?? 0),
      blockSize: toInt(rawBlock?.size ?? 0),
      numTxs: toInt(rawBlock?.nTx ?? txids.length, txids.length)
    },
    txs
  };
}

async function fetchIndexableBlock(height) {
  try {
    return await fetchChronikBlock(height);
  } catch (_) {}
  return buildIndexableBlockFromExplorer(height);
}

async function fetchHeightWithRetry(height, retryCfg) {
  const {
    retries,
    backoffMs,
    backoffMultiplier,
    maxBackoffMs
  } = retryCfg;

  let attempt = 0;
  let delayMs = backoffMs;
  let lastErr = null;

  while (attempt <= retries) {
    attempt += 1;
    try {
      const block = await fetchIndexableBlock(height);
      return { ok: true, attempts: attempt, block };
    } catch (err) {
      lastErr = err;
      if (attempt > retries) break;
      await sleep(delayMs);
      delayMs = Math.min(maxBackoffMs, Math.max(1, Math.floor(delayMs * backoffMultiplier)));
    }
  }

  return {
    ok: false,
    attempts: attempt,
    block: null,
    error: String(lastErr?.message || lastErr || 'unknown_error')
  };
}

async function main() {
  const windowSizeArg = Math.max(1, toInt(arg('window', '5000'), 5000));
  const startHeightRaw = String(arg('start-height', arg('start', '')) || '').trim();
  const endHeightRaw = String(arg('end-height', arg('end', '')) || '').trim();
  const hasStart = startHeightRaw !== '';
  const hasEnd = endHeightRaw !== '';
  const modeRaw = String(arg('mode', 'core-fast') || 'core-fast').trim().toLowerCase();
  const mode = modeRaw === 'full' || modeRaw === 'full-projection' ? 'full-projection' : 'core-fast';
  const withAddress = String(arg('with-address', mode === 'full-projection' ? 'true' : 'false')).toLowerCase() !== 'false';
  const withSocial = String(arg('with-social', mode === 'full-projection' ? 'true' : 'false')).toLowerCase() !== 'false';
  const withSnapshots = String(arg('with-snapshots', mode === 'full-projection' ? 'true' : 'false')).toLowerCase() !== 'false';
  const rawJson = String(arg('raw-json', mode === 'full-projection' ? 'full' : 'none')).trim().toLowerCase();
  const writerCommitBatch = Math.max(1, Math.min(50, toInt(arg('writer-commit-batch', mode === 'core-fast' ? '8' : '1'), mode === 'core-fast' ? 8 : 1)));
  const sqlChunkSize = Math.max(50, toInt(arg('sql-chunk-size', mode === 'core-fast' ? '420' : '200'), mode === 'core-fast' ? 420 : 200));
  const prevoutChunkSize = Math.max(50, toInt(arg('prevout-chunk-size', mode === 'core-fast' ? '240' : '120'), mode === 'core-fast' ? 240 : 120));
  const deltaChunkSize = Math.max(50, toInt(arg('delta-chunk-size', mode === 'core-fast' ? '420' : '200'), mode === 'core-fast' ? 420 : 200));
  const shardCount = Math.max(1, Math.min(64, toInt(arg('shard-count', '1'), 1)));
  const shardIndex = Math.max(0, Math.min(shardCount - 1, toInt(arg('shard-index', '0'), 0)));
  const parallel = Math.max(1, Math.min(64, toInt(arg('parallel', '8'), 8)));
  const maxPendingBlocks = Math.max(8, Math.min(2000, toInt(arg('max-pending-blocks', '128'), 128)));
  const skipExisting = String(arg('skip-existing', 'true')).toLowerCase() !== 'false';
  const snapshotEveryBlocks = Math.max(0, toInt(arg('snapshot-every-blocks', '10000'), 10000));
  const snapshotEveryMs = Math.max(0, toInt(arg('snapshot-every-ms', '600000'), 600000));
  const refreshSnapshotsOnComplete = String(arg('refresh-snapshots-on-complete', 'true')).toLowerCase() !== 'false';
  const retries = Math.max(0, Math.min(20, toInt(arg('retries', '3'), 3)));
  const backoffMs = Math.max(10, toInt(arg('backoff-ms', '500'), 500));
  const backoffMultiplier = Math.max(1, toNum(arg('backoff-multiplier', '2'), 2));
  const maxBackoffMs = Math.max(backoffMs, toInt(arg('max-backoff-ms', '10000'), 10000));

  const tip = await getTipHeight();
  let start = 0;
  let end = tip;
  if (hasStart) {
    start = Math.max(0, toInt(startHeightRaw, 0));
    const requestedEnd = hasEnd ? toInt(endHeightRaw, tip) : tip;
    end = Math.max(start, Math.min(requestedEnd, tip));
  } else {
    start = Math.max(0, tip - windowSizeArg + 1);
    end = tip;
  }
  const windowSize = end - start + 1;
  const total = countShardHeights(start, end, shardIndex, shardCount);
  if (total <= 0) {
    console.log(
      `[backfill:last5000] no work for shard ${shardIndex}/${shardCount} in range start=${start} end=${end}`
    );
    return;
  }
  const startedAt = Date.now();
  const indexedHeights = skipExisting ? await loadIndexedHeights(start, end, shardCount, shardIndex) : new Set();
  const initialIndexedCount = indexedHeights.size;
  const pendingHeights = [];
  for (let h = start + shardIndex; h <= end; h += shardCount) {
    if (skipExisting && indexedHeights.has(h)) continue;
    pendingHeights.push(h);
  }
  const totalWork = pendingHeights.length;
  const preSkippedCount = Math.max(0, total - totalWork);
  process.env.BACKFILL_MODE = mode === 'full-projection' ? 'full' : 'core';
  process.env.BACKFILL_WITH_ADDRESS = withAddress ? 'true' : 'false';
  process.env.BACKFILL_WITH_SOCIAL = withSocial ? 'true' : 'false';
  process.env.BACKFILL_WITH_SNAPSHOTS = withSnapshots ? 'true' : 'false';
  process.env.BACKFILL_RAW_JSON = rawJson;
  process.env.BACKFILL_SQL_CHUNK_SIZE = String(sqlChunkSize);
  process.env.BACKFILL_PREVOUT_CHUNK_SIZE = String(prevoutChunkSize);
  process.env.BACKFILL_DELTA_CHUNK_SIZE = String(deltaChunkSize);

  console.log(
    `[backfill:last5000] tip=${tip} start=${start} end=${end} total=${total} ` +
    `parallel=${parallel} retries=${retries} backoffMs=${backoffMs} multiplier=${backoffMultiplier} ` +
    `mode=${mode}:${hasStart ? 'range' : 'window'} ` +
    `skipExisting=${skipExisting} preIndexed=${initialIndexedCount} shard=${shardIndex}/${shardCount} ` +
    `withAddress=${withAddress} withSocial=${withSocial} withSnapshots=${withSnapshots} rawJson=${rawJson} ` +
    `sqlChunkSize=${sqlChunkSize} prevoutChunkSize=${prevoutChunkSize} deltaChunkSize=${deltaChunkSize} writerCommitBatch=${writerCommitBatch} maxPendingBlocks=${maxPendingBlocks} ` +
    `snapshotEveryBlocks=${snapshotEveryBlocks} snapshotEveryMs=${snapshotEveryMs} refreshSnapshotsOnComplete=${refreshSnapshotsOnComplete}`
  );

  if (skipExisting && totalWork <= 0) {
    const now = Date.now();
    console.log(
      `[done] backfill window=${windowSize} blocks=${total} ok=${total} failed=0 skipped=${total} indexed=0 elapsedMs=${now - startedAt} rate=0.00 blk/s (fast-exit: no remaining work)`
    );
    return;
  }

  let ok = preSkippedCount;
  let failed = 0;
  let skipped = preSkippedCount;
  let indexed = 0;
  let done = preSkippedCount;
  let nextPendingIdx = 0;
  let nextWriteHeight = start + shardIndex;
  const failedHeights = [];
  let lastMaterializedAt = 0;
  const pendingByHeight = new Map();
  let fetchersFinished = false;
  let notifyResolve = null;
  let spaceResolve = null;

  function notifyWriter() {
    if (notifyResolve) {
      const fn = notifyResolve;
      notifyResolve = null;
      fn();
    }
  }

  function notifySpace() {
    if (spaceResolve) {
      const fn = spaceResolve;
      spaceResolve = null;
      fn();
    }
  }

  async function waitForPending() {
    if (pendingByHeight.has(nextWriteHeight)) return;
    if (fetchersFinished && !pendingByHeight.has(nextWriteHeight)) return;
    await new Promise((resolve) => {
      notifyResolve = resolve;
    });
  }

  async function waitForSpace() {
    if (pendingByHeight.size < maxPendingBlocks) return;
    await new Promise((resolve) => {
      spaceResolve = resolve;
    });
  }

  function logProgress() {
    if (!(done % 100 === 0 || done === total)) return;
    const elapsedMs = Date.now() - startedAt;
    const elapsedSec = Math.max(1, elapsedMs / 1000);
    const workDone = Math.max(0, done - skipped);
    const blocksPerSec = workDone / elapsedSec;
    const remaining = Math.max(0, totalWork - workDone);
    const etaMs = blocksPerSec > 0 ? (remaining / blocksPerSec) * 1000 : 0;
    console.log(
      `[progress] ${done}/${total} ok=${ok} failed=${failed} active_workers=${parallel} writer_workers=1 ` +
      `rate=${blocksPerSec.toFixed(2)} blk/s eta=${formatDuration(etaMs)} skipped=${skipped} indexed=${indexed}`
    );
  }

  async function fetchWorker() {
    while (true) {
      await waitForSpace();
      if (nextPendingIdx >= pendingHeights.length) return;
      const idx = nextPendingIdx;
      nextPendingIdx += 1;
      const h = pendingHeights[idx];
      const fetched = await fetchHeightWithRetry(h, {
        retries,
        backoffMs,
        backoffMultiplier,
        maxBackoffMs
      });
      pendingByHeight.set(h, fetched.ok ? { kind: 'block', block: fetched.block } : { kind: 'error', error: fetched.error, attempts: fetched.attempts });
      notifyWriter();
    }
  }

  async function writer() {
    while (nextWriteHeight <= end) {
      if (skipExisting && indexedHeights.has(nextWriteHeight)) {
        nextWriteHeight += shardCount;
        continue;
      }
      if (!pendingByHeight.has(nextWriteHeight)) {
        await waitForPending();
        if (!pendingByHeight.has(nextWriteHeight) && fetchersFinished) break;
      }
      const current = pendingByHeight.get(nextWriteHeight);
      if (!current) continue;

      if (current.kind === 'error') {
        pendingByHeight.delete(nextWriteHeight);
        notifySpace();
        failed += 1;
        if (failedHeights.length < 50) {
          failedHeights.push({ height: nextWriteHeight, error: current.error || 'unknown_error' });
        }
        if (failed <= 15) {
          console.warn(
            `[warn] height ${nextWriteHeight} failed after ${current.attempts || 0} attempts: ${current.error}`
          );
        }
        done += 1;
        const shouldMaterialize =
          (snapshotEveryBlocks > 0 && indexed > 0 && done % snapshotEveryBlocks === 0) ||
          (snapshotEveryMs > 0 && indexed > 0 && (Date.now() - lastMaterializedAt >= snapshotEveryMs));
        if (shouldMaterialize) {
          lastMaterializedAt = Date.now();
          const tsSec = snapshotBucketTs(Math.floor(lastMaterializedAt / 1000));
          await materializeRichlistSnapshots(tsSec, 250).catch(() => {});
          await materializeNetworkSnapshot().catch(() => {});
        }
        logProgress();
        nextWriteHeight += shardCount;
      } else {
        const batchItems = [];
        let cursorHeight = nextWriteHeight;
        while (batchItems.length < writerCommitBatch) {
          const item = pendingByHeight.get(cursorHeight);
          if (!item || item.kind !== 'block') break;
          batchItems.push({ height: cursorHeight, block: item.block });
          cursorHeight += shardCount;
          if (cursorHeight > end) break;
          if (skipExisting && indexedHeights.has(cursorHeight)) break;
        }
        if (batchItems.length > 0) {
          for (const item of batchItems) pendingByHeight.delete(item.height);
          notifySpace();
          try {
            if (batchItems.length === 1) {
              const meta = await indexBlock(batchItems[0].block);
              if (meta) {
                ok += 1;
                indexed += 1;
              } else {
                failed += 1;
                if (failedHeights.length < 50) {
                  failedHeights.push({ height: batchItems[0].height, error: 'indexBlock returned null' });
                }
              }
              done += 1;
            } else {
              const metas = await indexBlocksBatch(batchItems.map((b) => b.block));
              const okCount = Array.isArray(metas) ? metas.length : 0;
              ok += okCount;
              indexed += okCount;
              const missing = batchItems.length - okCount;
              if (missing > 0) {
                failed += missing;
                for (let i = okCount; i < batchItems.length && failedHeights.length < 50; i += 1) {
                  failedHeights.push({ height: batchItems[i].height, error: 'indexBlocksBatch missing meta' });
                }
              }
              done += batchItems.length;
            }
          } catch (err) {
            const msg = String(err?.message || err || 'batch_write_failed');
            for (const item of batchItems) {
              try {
                const meta = await indexBlock(item.block);
                if (meta) {
                  ok += 1;
                  indexed += 1;
                } else {
                  failed += 1;
                  if (failedHeights.length < 50) failedHeights.push({ height: item.height, error: 'indexBlock returned null' });
                }
              } catch (innerErr) {
                failed += 1;
                const innerMsg = String(innerErr?.message || innerErr || msg);
                if (failedHeights.length < 50) failedHeights.push({ height: item.height, error: innerMsg });
                if (failed <= 15) {
                  console.warn(`[warn] height ${item.height} write failed: ${innerMsg}`);
                }
              }
              done += 1;
            }
          }
          const shouldMaterialize =
            (snapshotEveryBlocks > 0 && indexed > 0 && done % snapshotEveryBlocks === 0) ||
            (snapshotEveryMs > 0 && indexed > 0 && (Date.now() - lastMaterializedAt >= snapshotEveryMs));
          if (shouldMaterialize) {
            lastMaterializedAt = Date.now();
            const tsSec = snapshotBucketTs(Math.floor(lastMaterializedAt / 1000));
            await materializeRichlistSnapshots(tsSec, 250).catch(() => {});
            await materializeNetworkSnapshot().catch(() => {});
          }
          logProgress();
          nextWriteHeight = cursorHeight;
          continue;
        }

        pendingByHeight.delete(nextWriteHeight);
        notifySpace();
        try {
          const meta = await indexBlock(current.block);
          if (meta) {
            ok += 1;
            indexed += 1;
          } else {
            failed += 1;
            if (failedHeights.length < 50) {
              failedHeights.push({ height: nextWriteHeight, error: 'indexBlock returned null' });
            }
          }
        } catch (err) {
          failed += 1;
          const msg = String(err?.message || err || 'index_write_failed');
          if (failedHeights.length < 50) {
            failedHeights.push({ height: nextWriteHeight, error: msg });
          }
          if (failed <= 15) {
            console.warn(`[warn] height ${nextWriteHeight} write failed: ${msg}`);
          }
        }
        done += 1;
        const shouldMaterialize =
          (snapshotEveryBlocks > 0 && indexed > 0 && done % snapshotEveryBlocks === 0) ||
          (snapshotEveryMs > 0 && indexed > 0 && (Date.now() - lastMaterializedAt >= snapshotEveryMs));
        if (shouldMaterialize) {
          lastMaterializedAt = Date.now();
          const tsSec = snapshotBucketTs(Math.floor(lastMaterializedAt / 1000));
          await materializeRichlistSnapshots(tsSec, 250).catch(() => {});
          await materializeNetworkSnapshot().catch(() => {});
        }
        logProgress();
        nextWriteHeight += shardCount;
      }
    }
  }

  const fetchers = Array.from({ length: parallel }, () => fetchWorker());
  const fetchAll = Promise.all(fetchers).then(() => {
    fetchersFinished = true;
    notifyWriter();
  });
  await Promise.all([fetchAll, writer()]);
  let finalRich = { balance: 0, received: 0 };
  let finalPeers = 0;
  if (refreshSnapshotsOnComplete && indexed > 0) {
    const finalTsSec = snapshotBucketTs(Math.floor(Date.now() / 1000));
    finalRich = await materializeRichlistSnapshots(finalTsSec, 500).catch(() => ({ balance: 0, received: 0 }));
    finalPeers = await materializeNetworkSnapshot().catch(() => 0);
  }

  await sql(
    `INSERT OR REPLACE INTO sync_state(name, value, updated_at)
     VALUES('backfill_last_window', ?, ?)`,
    JSON.stringify({
      start,
      end,
      tip,
      mode: hasStart ? 'range' : 'window',
      ingestMode: mode,
      withAddress,
      withSocial,
      withSnapshots,
      rawJson,
      sqlChunkSize,
      prevoutChunkSize,
      deltaChunkSize,
      writerCommitBatch,
      requestedStart: hasStart ? start : null,
      requestedEnd: hasEnd ? Math.max(0, toInt(endHeightRaw, tip)) : null,
      windowSize,
      parallel,
      shardCount,
      shardIndex,
      skipExisting,
      preIndexed: initialIndexedCount,
      totalWork,
      snapshotEveryBlocks,
      snapshotEveryMs,
      refreshSnapshotsOnComplete,
      retries,
      backoffMs,
      backoffMultiplier,
      maxBackoffMs,
      ok,
      failed,
      skipped,
      indexed,
      richlistRowsBalance: finalRich.balance || 0,
      richlistRowsReceived: finalRich.received || 0,
      peersCaptured: finalPeers || 0,
      elapsedMs: Date.now() - startedAt,
      failedHeights
    }),
    Date.now()
  );

  console.log(
    `[done] backfill window=${windowSize} blocks=${total} ok=${ok} failed=${failed} skipped=${skipped} indexed=${indexed} elapsedMs=${Date.now() - startedAt} ` +
    `rate=${(Math.max(0, done - skipped) / Math.max(1, (Date.now() - startedAt) / 1000)).toFixed(2)} blk/s`
  );
}

main()
  .catch((err) => {
    console.error('[backfill:last5000] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

