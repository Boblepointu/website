import { sql, closeDb } from '../db/client.js';
import { getBlock, getBlockchainInfo } from './lotus-api-client.js';
import { indexBlock } from './index-block.js';
import { config } from '../config.js';

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function argValue(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

async function fetchExplorerBlock(hashOrHeight) {
  const base = (config.explorerFallbackBase || 'https://explorer.lotusia.org').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/getblock?hash=${encodeURIComponent(String(hashOrHeight))}`);
  if (!res.ok) throw new Error(`explorer getblock failed ${res.status}`);
  return res.json();
}

async function fetchExplorerTx(txid) {
  const base = (config.explorerFallbackBase || 'https://explorer.lotusia.org').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/getrawtransaction?txid=${encodeURIComponent(String(txid))}&decrypt=1`);
  if (!res.ok) throw new Error(`explorer getrawtransaction failed ${res.status}`);
  return res.json();
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
      prevOut: { txid: i?.txid || '', outIdx: Number(i?.vout ?? -1) },
      coinbase: i?.coinbase || '',
      sequence: Number(i?.sequence || 0),
      inputScript: i?.scriptSig?.hex || ''
    })),
    outputs: vout.map((o) => ({
      value: Number.isFinite(Number(o?.value)) ? Math.floor(Number(o.value) * 100000000) : 0,
      outputScript: o?.scriptPubKey?.hex || '',
      scriptPubKey: {
        type: o?.scriptPubKey?.type || '',
        addresses: Array.isArray(o?.scriptPubKey?.addresses) ? o.scriptPubKey.addresses : []
      },
      address: Array.isArray(o?.scriptPubKey?.addresses) ? (o.scriptPubKey.addresses[0] || '') : '',
      rankOutput: o?.rankOutput || null
    }))
  };
}

async function buildIndexableBlockFromExplorer(hashOrHeight) {
  const rawBlock = await fetchExplorerBlock(hashOrHeight);
  const txids = Array.isArray(rawBlock?.tx) ? rawBlock.tx : [];
  const txs = [];
  for (const txid of txids) {
    try {
      const rawTx = await fetchExplorerTx(txid);
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

async function getTipHeight() {
  try {
    const info = await getBlockchainInfo();
    return toInt(info?.tipHeight ?? info?.tip_height ?? info?.blocks, 0);
  } catch (_) {
    const rows = await sql(`SELECT MAX(height) AS tip FROM blocks`);
    return toInt(rows?.[0]?.tip, 0);
  }
}

async function purgeWindow(startHeight, endHeight) {
  await sql(
    `DELETE FROM protocol_events
     WHERE protocol_id = 'rank'
       AND block_height BETWEEN ? AND ?`,
    startHeight,
    endHeight
  );
  await sql(
    `DELETE FROM domain_event_dims
     WHERE event_id IN (
       SELECT event_id FROM domain_events
       WHERE source_protocol = 'rank'
         AND block_height BETWEEN ? AND ?
     )`,
    startHeight,
    endHeight
  );
  await sql(
    `DELETE FROM domain_events
     WHERE source_protocol = 'rank'
       AND block_height BETWEEN ? AND ?`,
    startHeight,
    endHeight
  );
  await sql(
    `DELETE FROM domain_entity_dims
     WHERE entity_id IN (
       SELECT entity_id FROM domain_entities
       WHERE source_protocol = 'rank'
         AND object_type IN ('profile', 'post')
     )`
  );
  await sql(
    `DELETE FROM domain_entities
     WHERE source_protocol = 'rank'
       AND object_type IN ('profile', 'post')`
  );
}

async function reindexWindow(startHeight, endHeight) {
  let ok = 0;
  let fail = 0;
  for (let h = startHeight; h <= endHeight; h += 1) {
    try {
      let block = null;
      try {
        block = await getBlock(h);
      } catch (_) {
        block = null;
      }
      if (!block || !Array.isArray(block.txs) || block.txs.length === 0) {
        block = await buildIndexableBlockFromExplorer(h);
      }
      await indexBlock(block);
      ok += 1;
      if (ok % 100 === 0) console.log(`[repair-rank] indexed ${ok} blocks`);
    } catch (err) {
      fail += 1;
      console.warn(`[repair-rank] failed height=${h}: ${err?.message || err}`);
    }
  }
  return { ok, fail };
}

async function main() {
  const tip = await getTipHeight();
  const windowArg = toInt(argValue('--window', '5000'), 5000);
  const endHeight = toInt(argValue('--end', String(tip)), tip);
  const startDefault = Math.max(0, endHeight - Math.max(1, windowArg) + 1);
  const startHeight = toInt(argValue('--start', String(startDefault)), startDefault);

  console.log(`[repair-rank] start=${startHeight} end=${endHeight}`);
  await purgeWindow(startHeight, endHeight);
  const out = await reindexWindow(startHeight, endHeight);
  console.log(JSON.stringify({ startHeight, endHeight, ...out }, null, 2));
}

main()
  .catch((err) => {
    console.error('[repair-rank] failed', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
