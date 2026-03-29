import { publishEvent } from '../events/bus.js';
import { getBlockchainInfo, getBlock } from './lotus-api-client.js';
import { sql } from '../db/client.js';
import { indexBlock } from './index-block.js';

async function main() {
  const chain = await getBlockchainInfo();
  const tipHeight = Number(chain?.tipHeight ?? chain?.blocks ?? 0);
  if (!Number.isFinite(tipHeight) || tipHeight <= 0) {
    throw new Error('Unable to resolve chain tip height');
  }
  const block = await getBlock(tipHeight);
  const meta = await indexBlock(block);
  if (!meta) throw new Error('Unable to index tip block');
  await publishEvent('chain.block.discovered', String(tipHeight), {
    height: tipHeight,
    hash: meta.hash
  });
  await sql(
    `INSERT OR REPLACE INTO sync_state(name, value, updated_at) VALUES('chain_tip_indexed', ?, ?)`,
    String(tipHeight),
    Date.now()
  );
  console.log('[ok] synced tip block', tipHeight);
}

main().catch((err) => {
  console.error('[tip-sync] failed:', err?.message || err);
  process.exit(1);
});

