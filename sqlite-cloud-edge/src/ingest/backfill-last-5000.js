import { closeDb, sql } from '../db/client.js';
import { config } from '../config.js';
import { indexBlock } from './index-block.js';
import { getBlock, getBlockchainInfo } from './lotus-api-client.js';

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

function hasTxs(block) {
  return Array.isArray(block?.txs) && block.txs.length > 0;
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
    const info = await getBlockchainInfo();
    const tip = toInt(info?.tipHeight ?? info?.blocks ?? info?.tip_height ?? 0, 0);
    if (tip > 0) return tip;
  } catch (_) {}

  const base = explorerBase();
  const raw = await fetchJson(`${base}/api/getblockcount`);
  const tip = toInt(raw, 0);
  if (tip <= 0) throw new Error('Unable to resolve tip height from Lotus API and explorer fallback');
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
  let lotusApiBlock = null;
  try {
    lotusApiBlock = await getBlock(height);
  } catch (_) {
    lotusApiBlock = null;
  }

  if (hasTxs(lotusApiBlock)) return lotusApiBlock;
  const lotusApiHash = lotusApiBlock?.blockInfo?.hash || lotusApiBlock?.hash || '';
  return buildIndexableBlockFromExplorer(height, lotusApiHash);
}

async function processHeightWithRetry(height, retryCfg) {
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
      const meta = await indexBlock(block);
      return { ok: Boolean(meta), attempts: attempt };
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
    error: String(lastErr?.message || lastErr || 'unknown_error')
  };
}

async function main() {
  const windowSize = Math.max(1, toInt(arg('window', '5000'), 5000));
  const parallel = Math.max(1, Math.min(64, toInt(arg('parallel', '8'), 8)));
  const retries = Math.max(0, Math.min(20, toInt(arg('retries', '3'), 3)));
  const backoffMs = Math.max(10, toInt(arg('backoff-ms', '500'), 500));
  const backoffMultiplier = Math.max(1, toNum(arg('backoff-multiplier', '2'), 2));
  const maxBackoffMs = Math.max(backoffMs, toInt(arg('max-backoff-ms', '10000'), 10000));

  const tip = await getTipHeight();
  const start = Math.max(0, tip - windowSize + 1);
  const end = tip;
  const total = end - start + 1;
  const startedAt = Date.now();

  console.log(
    `[backfill:last5000] tip=${tip} start=${start} end=${end} total=${total} ` +
    `parallel=${parallel} retries=${retries} backoffMs=${backoffMs} multiplier=${backoffMultiplier}`
  );

  let ok = 0;
  let failed = 0;
  let done = 0;
  let nextHeight = start;
  const failedHeights = [];
  let lastMaterializedAt = 0;
  let lastMaterializedHeight = 0;

  async function worker(workerId) {
    while (true) {
      if (nextHeight > end) return;
      const h = nextHeight;
      nextHeight += 1;

      const result = await processHeightWithRetry(h, {
        retries,
        backoffMs,
        backoffMultiplier,
        maxBackoffMs
      });

      if (result.ok) {
        ok += 1;
      } else {
        failed += 1;
        if (failedHeights.length < 50) {
          failedHeights.push({ height: h, error: result.error || 'unknown_error' });
        }
        if (failed <= 15) {
          console.warn(`[warn] height ${h} failed after ${result.attempts} attempts: ${result.error}`);
        }
      }

      done += 1;
      const shouldMaterialize =
        done === total ||
        (done % 1000 === 0) ||
        (h - lastMaterializedHeight >= 5000) ||
        (Date.now() - lastMaterializedAt >= 120000);
      if (shouldMaterialize) {
        lastMaterializedAt = Date.now();
        lastMaterializedHeight = h;
        const tsSec = snapshotBucketTs(Math.floor(lastMaterializedAt / 1000));
        await materializeRichlistSnapshots(tsSec, 250).catch(() => {});
        await materializeNetworkSnapshot().catch(() => {});
      }
      if (done % 100 === 0 || done === total) {
        console.log(`[progress] ${done}/${total} ok=${ok} failed=${failed} active_workers=${parallel}`);
      }
    }
  }

  const workers = Array.from({ length: parallel }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  const finalTsSec = snapshotBucketTs(Math.floor(Date.now() / 1000));
  const finalRich = await materializeRichlistSnapshots(finalTsSec, 500).catch(() => ({ balance: 0, received: 0 }));
  const finalPeers = await materializeNetworkSnapshot().catch(() => 0);

  await sql(
    `INSERT OR REPLACE INTO sync_state(name, value, updated_at)
     VALUES('backfill_last_window', ?, ?)`,
    JSON.stringify({
      start,
      end,
      tip,
      windowSize,
      parallel,
      retries,
      backoffMs,
      backoffMultiplier,
      maxBackoffMs,
      ok,
      failed,
      richlistRowsBalance: finalRich.balance || 0,
      richlistRowsReceived: finalRich.received || 0,
      peersCaptured: finalPeers || 0,
      elapsedMs: Date.now() - startedAt,
      failedHeights
    }),
    Date.now()
  );

  console.log(
    `[done] backfill window=${windowSize} blocks=${total} ok=${ok} failed=${failed} elapsedMs=${Date.now() - startedAt}`
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

