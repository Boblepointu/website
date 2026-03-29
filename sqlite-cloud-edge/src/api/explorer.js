import { sql } from '../db/client.js';
import { enqueueHydration } from '../ingest/read-through.js';

export async function getExplorerOverview() {
  const rows = await sql(
    `SELECT height, hash, time, size, n_tx
     FROM blocks
     ORDER BY height DESC
     LIMIT 1`
  );
  if (!rows?.length) {
    await enqueueHydration('tip', {});
    return { mininginfo: { blocks: 0 }, peerinfo: [] };
  }
  const tip = rows[0];
  return {
    mininginfo: {
      blocks: Number(tip.height || 0)
    },
    peerinfo: [],
    latestBlock: tip
  };
}

export async function getExplorerBlocks(page = 1, pageSize = 10) {
  const p = Math.max(1, Number(page || 1));
  const ps = Math.max(1, Math.min(100, Number(pageSize || 10)));
  const offset = (p - 1) * ps;
  const rows = await sql(
    `SELECT height, hash, size, n_tx, time
     FROM blocks
     ORDER BY height DESC
     LIMIT ? OFFSET ?`,
    ps,
    offset
  );
  if (!rows?.length) {
    await enqueueHydration('blocks_page', { page: p, pageSize: ps });
  }
  return {
    blocks: rows || [],
    page: p,
    pageSize: ps,
    hasMore: (rows || []).length === ps
  };
}

