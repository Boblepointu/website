import { getBlock } from './lotus-api-client.js';
import { sql } from '../db/client.js';
import { indexBlock } from './index-block.js';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

async function main() {
  const start = Number(arg('start', '0'));
  const end = Number(arg('end', '0'));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Use --start=<height> --end=<height>');
  }
  let count = 0;
  for (let h = start; h <= end; h += 1) {
    const block = await getBlock(h);
    const meta = await indexBlock(block);
    if (meta) count += 1;
  }
  await sql(
    `INSERT OR REPLACE INTO sync_state(name, value, updated_at) VALUES('backfill_cursor', ?, ?)`,
    String(end),
    Date.now()
  );
  console.log(`[ok] backfilled ${count} blocks (${start}-${end})`);
}

main().catch((err) => {
  console.error('[backfill] failed:', err?.message || err);
  process.exit(1);
});

