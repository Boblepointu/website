import { closeDb, sql } from './client.js';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function nowMs() {
  return Date.now();
}

function padRight(v, n) {
  const s = String(v ?? '');
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

function padLeft(v, n) {
  const s = String(v ?? '');
  if (s.length >= n) return s.slice(0, n);
  return ' '.repeat(n - s.length) + s;
}

function fmtNum(v) {
  return new Intl.NumberFormat('en-US').format(Number(v || 0));
}

function fmtMs(v) {
  const ms = Math.max(0, Number(v || 0));
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m${String(ss).padStart(2, '0')}s`;
  if (m > 0) return `${m}m${String(ss).padStart(2, '0')}s`;
  return `${ss}s`;
}

async function scalar(query, ...params) {
  const rows = await sql(query, ...params);
  const row = rows?.[0] || {};
  const key = Object.keys(row)[0];
  return row?.[key] ?? 0;
}

function statusIcon(level) {
  if (level === 'FAIL') return 'X';
  if (level === 'WARN') return '!';
  return 'OK';
}

function makeRow(level, check, value, detail = '') {
  return { level, check, value, detail };
}

function printTable(title, rows) {
  const levelW = 8;
  const checkW = 36;
  const valueW = 16;
  const detailW = 56;
  const line =
    '+' +
    '-'.repeat(levelW + 2) +
    '+' +
    '-'.repeat(checkW + 2) +
    '+' +
    '-'.repeat(valueW + 2) +
    '+' +
    '-'.repeat(detailW + 2) +
    '+';

  console.log('');
  console.log(`== ${title} ==`);
  console.log(line);
  console.log(
    `| ${padRight('STAT', levelW)} | ${padRight('CHECK', checkW)} | ${padRight('VALUE', valueW)} | ${padRight('DETAIL', detailW)} |`
  );
  console.log(line);
  for (const r of rows) {
    const stat = `${statusIcon(r.level)} ${r.level}`;
    console.log(
      `| ${padRight(stat, levelW)} | ${padRight(r.check, checkW)} | ${padLeft(r.value, valueW)} | ${padRight(r.detail || '', detailW)} |`
    );
  }
  console.log(line);
}

async function main() {
  const recentWindow = Math.max(100, toInt(arg('recent-window', '2000'), 2000));
  const staleMsWarn = Math.max(1000, toInt(arg('stale-warn-ms', '30000'), 30000));
  const strict = String(arg('strict', 'false')).toLowerCase() === 'true';

  const started = nowMs();
  const rows = [];

  const blockStats = (await sql('SELECT COUNT(*) AS blocks, MIN(height) AS min_h, MAX(height) AS max_h, MAX(indexed_at) AS max_idx FROM blocks'))[0] || {};
  const txStats = (await sql('SELECT COUNT(*) AS txs FROM transactions'))[0] || {};
  const ioStats = (await sql('SELECT (SELECT COUNT(*) FROM tx_inputs) AS vin_c, (SELECT COUNT(*) FROM tx_outputs) AS vout_c'))[0] || {};

  const ageMs = Math.max(0, nowMs() - Number(blockStats.max_idx || 0));
  rows.push(
    makeRow(
      ageMs > staleMsWarn ? 'WARN' : 'PASS',
      'Indexer freshness',
      fmtMs(ageMs),
      ageMs > staleMsWarn ? `stale > ${fmtMs(staleMsWarn)}` : 'recent writes seen'
    )
  );
  rows.push(makeRow('PASS', 'Blocks', fmtNum(blockStats.blocks || 0), `height ${blockStats.min_h ?? '-'}..${blockStats.max_h ?? '-'}`));
  rows.push(makeRow('PASS', 'Transactions', fmtNum(txStats.txs || 0), `vin=${fmtNum(ioStats.vin_c || 0)} vout=${fmtNum(ioStats.vout_c || 0)}`));

  const txWithoutBlock = Number(
    await scalar(
      'SELECT COUNT(*) AS c FROM transactions t LEFT JOIN blocks b ON b.height=t.block_height WHERE b.height IS NULL'
    )
  );
  rows.push(
    makeRow(
      txWithoutBlock > 0 ? 'FAIL' : 'PASS',
      'Orphan tx -> missing block',
      fmtNum(txWithoutBlock),
      txWithoutBlock > 0 ? 'referential break' : 'none'
    )
  );

  const inputsWithoutTx = Number(await scalar('SELECT COUNT(*) AS c FROM tx_inputs i LEFT JOIN transactions t ON t.txid=i.txid WHERE t.txid IS NULL'));
  rows.push(
    makeRow(
      inputsWithoutTx > 0 ? 'FAIL' : 'PASS',
      'Orphan inputs -> missing tx',
      fmtNum(inputsWithoutTx),
      inputsWithoutTx > 0 ? 'referential break' : 'none'
    )
  );

  const outputsWithoutTx = Number(await scalar('SELECT COUNT(*) AS c FROM tx_outputs o LEFT JOIN transactions t ON t.txid=o.txid WHERE t.txid IS NULL'));
  rows.push(
    makeRow(
      outputsWithoutTx > 0 ? 'FAIL' : 'PASS',
      'Orphan outputs -> missing tx',
      fmtNum(outputsWithoutTx),
      outputsWithoutTx > 0 ? 'referential break' : 'none'
    )
  );

  const blockTxMismatch = Number(
    await scalar(
      `SELECT COUNT(*) AS c FROM (
         SELECT b.height, b.n_tx, COUNT(t.txid) AS actual
         FROM blocks b
         LEFT JOIN transactions t ON t.block_height=b.height
         GROUP BY b.height
         HAVING ABS(COALESCE(b.n_tx,0)-actual) > 0
       ) x`
    )
  );
  rows.push(
    makeRow(
      blockTxMismatch > 0 ? 'WARN' : 'PASS',
      'Block n_tx mismatch',
      fmtNum(blockTxMismatch),
      blockTxMismatch > 0 ? 'blocks where header n_tx != stored tx count' : 'none'
    )
  );

  const blocksWithoutTx = Number(
    await scalar(
      `SELECT COUNT(*) AS c FROM (
         SELECT b.height
         FROM blocks b
         LEFT JOIN transactions t ON t.block_height=b.height
         GROUP BY b.height
         HAVING COUNT(t.txid)=0
       ) x`
    )
  );
  rows.push(
    makeRow(
      blocksWithoutTx > 0 ? 'WARN' : 'PASS',
      'Blocks with zero tx rows',
      fmtNum(blocksWithoutTx),
      blocksWithoutTx > 0 ? 'likely partial materialization' : 'none'
    )
  );

  const prevoutMissing = Number(
    await scalar(
      `SELECT COUNT(*) AS c
       FROM tx_inputs i
       LEFT JOIN tx_outputs o ON o.txid=i.prev_txid AND o.vout=i.prev_vout
       WHERE i.prev_txid <> '' AND i.prev_vout >= 0 AND o.txid IS NULL`
    )
  );
  rows.push(
    makeRow(
      prevoutMissing > 0 ? 'WARN' : 'PASS',
      'Inputs missing prevout join',
      fmtNum(prevoutMissing),
      prevoutMissing > 0 ? 'expected during partial-history ingest' : 'none'
    )
  );

  const invalidRankPostId = Number(
    await scalar(
      `SELECT COUNT(*) AS c
       FROM domain_event_dims
       WHERE dim_key='post_id'
         AND (LENGTH(dim_value)<15 OR LENGTH(dim_value)>20 OR dim_value GLOB '*[^0-9]*')`
    )
  );
  rows.push(
    makeRow(
      invalidRankPostId > 0 ? 'WARN' : 'PASS',
      'Invalid social post_id format',
      fmtNum(invalidRankPostId),
      invalidRankPostId > 0 ? 'non-numeric or out-of-range IDs present' : 'none'
    )
  );

  const eventDimsOrphans = Number(
    await scalar(
      'SELECT COUNT(*) AS c FROM domain_event_dims d LEFT JOIN domain_events e ON e.event_id=d.event_id WHERE e.event_id IS NULL'
    )
  );
  rows.push(
    makeRow(
      eventDimsOrphans > 0 ? 'FAIL' : 'PASS',
      'Orphan domain_event_dims',
      fmtNum(eventDimsOrphans),
      eventDimsOrphans > 0 ? 'dimension row missing event' : 'none'
    )
  );

  const entityDimsOrphans = Number(
    await scalar(
      'SELECT COUNT(*) AS c FROM domain_entity_dims d LEFT JOIN domain_entities e ON e.entity_id=d.entity_id WHERE e.entity_id IS NULL'
    )
  );
  rows.push(
    makeRow(
      entityDimsOrphans > 0 ? 'FAIL' : 'PASS',
      'Orphan domain_entity_dims',
      fmtNum(entityDimsOrphans),
      entityDimsOrphans > 0 ? 'dimension row missing entity' : 'none'
    )
  );

  const negativeBalances = Number(await scalar('SELECT COUNT(*) AS c FROM address_balances WHERE balance_sats < 0'));
  rows.push(
    makeRow(
      negativeBalances > 0 ? 'FAIL' : 'PASS',
      'Negative address balances',
      fmtNum(negativeBalances),
      negativeBalances > 0 ? 'must never be negative' : 'none'
    )
  );

  const chainRows = await sql(
    `SELECT height, hash, prev_hash
     FROM blocks
     WHERE height >= (SELECT COALESCE(MAX(height)-?, 0) FROM blocks)
     ORDER BY height DESC`,
    recentWindow
  );
  let prevHashMismatch = 0;
  for (let i = 0; i < chainRows.length - 1; i += 1) {
    const cur = chainRows[i];
    const next = chainRows[i + 1];
    if (String(cur?.prev_hash || '') !== String(next?.hash || '')) prevHashMismatch += 1;
  }
  rows.push(
    makeRow(
      prevHashMismatch > 0 ? 'FAIL' : 'PASS',
      `Prev-hash mismatches (last ${recentWindow})`,
      fmtNum(prevHashMismatch),
      prevHashMismatch > 0 ? 'broken chain linkage in recent window' : 'none'
    )
  );

  const levelCounts = rows.reduce(
    (acc, r) => {
      acc[r.level] += 1;
      return acc;
    },
    { PASS: 0, WARN: 0, FAIL: 0 }
  );
  const finalLevel = levelCounts.FAIL > 0 ? 'FAIL' : levelCounts.WARN > 0 ? 'WARN' : 'PASS';

  printTable('LOTUSIA DB SANITY / COHERENCE REPORT', rows);
  console.log('');
  console.log(
    `Summary: PASS=${levelCounts.PASS} WARN=${levelCounts.WARN} FAIL=${levelCounts.FAIL} ` +
      `-> ${finalLevel} (runtime ${fmtMs(nowMs() - started)})`
  );
  console.log(`Flags: strict=${strict} recentWindow=${recentWindow} staleWarn=${fmtMs(staleMsWarn)}`);

  if (finalLevel === 'FAIL' || (strict && levelCounts.WARN > 0)) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[sanity:coherence] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

