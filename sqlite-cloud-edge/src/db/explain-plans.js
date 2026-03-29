import { sql, closeDb } from './client.js';

const QUERIES = [
  {
    id: 'explorer.blocks.page',
    sql: `SELECT height, hash, size, n_tx, time
          FROM blocks
          ORDER BY height DESC
          LIMIT 25 OFFSET 0`
  },
  {
    id: 'explorer.tx.by_block_height',
    sql: `SELECT txid, block_height, block_time
          FROM transactions
          WHERE block_height = 1200000
          ORDER BY txid
          LIMIT 100`
  },
  {
    id: 'explorer.address.history',
    sql: `SELECT txid, vout, value_sats, block_height, block_time
          FROM addresses
          WHERE address = 'lotus_16PSJJfo6CiBc4PoXSJVJ3WmwFCjZr4GMV4JjG43u'
          ORDER BY block_height DESC
          LIMIT 50`
  },
  {
    id: 'protocol.events.latest.rank',
    sql: `SELECT event_key, txid, block_height, discovered_at
          FROM protocol_events
          WHERE protocol_id = 'rank'
          ORDER BY discovered_at DESC
          LIMIT 100`
  },
  {
    id: 'social.profiles.top',
    sql: `SELECT p.dim_value AS platform, r.dim_value AS profile_id, e.score AS ranking
          FROM domain_entities e
          JOIN domain_entity_dims p ON p.entity_id = e.entity_id AND p.dim_key = 'platform'
          JOIN domain_entity_dims r ON r.entity_id = e.entity_id AND r.dim_key = 'profile_id'
          WHERE e.domain = 'social' AND e.object_type = 'profile' AND e.source_protocol = 'rank'
          ORDER BY CAST(e.score AS INTEGER) DESC
          LIMIT 50`
  },
  {
    id: 'social.votes.profile.timeline',
    sql: `SELECT e.txid, e.direction, e.amount_text, e.block_time
          FROM domain_events e
          JOIN domain_event_dims p ON p.event_id = e.event_id AND p.dim_key = 'platform'
          JOIN domain_event_dims r ON r.event_id = e.event_id AND r.dim_key = 'profile_id'
          WHERE e.domain = 'social' AND p.dim_value = 'twitter' AND r.dim_value = 'crazhfty'
          ORDER BY e.block_time DESC
          LIMIT 100`
  },
  {
    id: 'eventbus.consume.partition',
    sql: `SELECT event_id, offset, created_at
          FROM event_log
          WHERE topic = 'chain.block.fetched' AND partition_key = '1200000' AND offset > 0
          ORDER BY offset ASC
          LIMIT 100`
  },
  {
    id: 'jobs.next.pending',
    sql: `SELECT id, kind, next_run_at
          FROM ingest_jobs
          WHERE status = 'queued'
          ORDER BY next_run_at ASC
          LIMIT 100`
  },
  {
    id: 'explorer.stats.timeseries',
    sql: `SELECT snapshot_ts, block_height, hashrate, difficulty, mempool_count
          FROM chain_stats_snapshots
          ORDER BY snapshot_ts DESC
          LIMIT 288`
  },
  {
    id: 'explorer.richlist.balance',
    sql: `SELECT address, balance_sats
          FROM address_balances
          ORDER BY balance_sats DESC
          LIMIT 100`
  },
  {
    id: 'explorer.richlist.received',
    sql: `SELECT address, received_sats
          FROM address_received
          ORDER BY received_sats DESC
          LIMIT 100`
  },
  {
    id: 'explorer.network.peers',
    sql: `SELECT address, subver, synced_blocks, country_code
          FROM peer_snapshots
          ORDER BY captured_at DESC
          LIMIT 100`
  }
];

async function explainOne(item) {
  const rows = await sql(`EXPLAIN QUERY PLAN ${item.sql}`);
  const details = (rows || []).map((r) => String(r.detail || r.DETAIL || '')).filter(Boolean);
  const hasIndex = details.some((d) => {
    const up = d.toUpperCase();
    return up.includes('USING INDEX') || up.includes('USING COVERING INDEX');
  });
  const hasTableScan = details.some((d) => {
    const up = d.toUpperCase();
    return up.includes('SCAN') && !up.includes('USING INDEX') && !up.includes('USING COVERING INDEX');
  });
  return {
    id: item.id,
    hasIndex,
    hasTableScan,
    plan: details
  };
}

async function main() {
  const out = [];
  try {
    for (const q of QUERIES) {
      out.push(await explainOne(q));
    }
  } finally {
    await closeDb();
  }

  for (const item of out) {
    console.log(`\n[${item.id}]`);
    console.log(`hasIndex=${item.hasIndex} hasTableScan=${item.hasTableScan}`);
    for (const line of item.plan) console.log(`- ${line}`);
  }

  const risky = out.filter((i) => i.hasTableScan && !i.hasIndex);
  if (risky.length) {
    console.log('\nPotentially expensive query paths:');
    for (const r of risky) console.log(`- ${r.id}`);
  } else {
    console.log('\nNo fully unindexed plans detected in sampled queries.');
  }
}

main().catch((err) => {
  console.error('[explain] failed:', err?.message || err);
  process.exit(1);
});

