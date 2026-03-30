import { spawn } from 'node:child_process';
import { closeDb, sql } from '../db/client.js';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function detectTipHeight() {
  const rows = await sql('SELECT MAX(height) AS h FROM blocks');
  return Math.max(0, toInt(rows?.[0]?.h, 0));
}

function parseAggRate(line) {
  const m = String(line).match(/agg_rate=([0-9.]+)\s+blk\/s/);
  return m ? toNum(m[1], 0) : null;
}

function parseLockErrors(line) {
  const m = String(line).match(/lock_errors=([0-9]+)/);
  return m ? toInt(m[1], 0) : null;
}

function parseDoneRate(line) {
  const m = String(line).match(/rate=([0-9.]+)\s+blk\/s/);
  return m ? toNum(m[1], 0) : null;
}

function parseIndexed(line) {
  const m = String(line).match(/indexed=([0-9]+)/);
  return m ? toInt(m[1], 0) : null;
}

async function runCase(name, args) {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let aggRate = null;
    let doneRate = null;
    let lockErrors = null;
    let indexed = 0;
    const lines = [];
    child.stdout.on('data', (buf) => {
      const chunk = String(buf || '');
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        lines.push(line);
        const a = parseAggRate(line);
        if (a !== null) aggRate = a;
        const d = parseDoneRate(line);
        if (d !== null) doneRate = d;
        const l = parseLockErrors(line);
        if (l !== null) lockErrors = l;
        const i = parseIndexed(line);
        if (i !== null) indexed = Math.max(indexed, i);
      }
    });
    child.stderr.on('data', (buf) => {
      const chunk = String(buf || '');
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        lines.push(`[err] ${line}`);
      }
    });
    child.on('exit', (code) => {
      resolve({
        name,
        code: code ?? 1,
        aggRate: aggRate ?? 0,
        doneRate: doneRate ?? 0,
        lockErrors: lockErrors ?? 0,
        indexed,
        tail: lines.slice(-20)
      });
    });
  });
}

function printReport(results, minRate, maxLocks) {
  console.log('');
  console.log('== BENCHMARK GATES ==');
  for (const r of results) {
    const rate = Math.max(r.aggRate, r.doneRate);
    const ratePass = r.name === 'skip-heavy' || r.indexed === 0 ? true : rate >= minRate;
    const lockPass = r.lockErrors <= maxLocks;
    const pass = r.code === 0 && ratePass && lockPass;
    console.log(
      `${pass ? 'PASS' : 'FAIL'} case=${r.name} code=${r.code} rate=${rate.toFixed(2)} blk/s locks=${r.lockErrors}`
    );
    if (!pass) {
      for (const line of r.tail.slice(-5)) console.log(`  ${line}`);
    }
  }
}

async function main() {
  const tip = await detectTipHeight();
  const minRate = Math.max(1, toNum(arg('min-rate', '30'), 30));
  const maxLocks = Math.max(0, toInt(arg('max-locks', '0'), 0));
  const scriptPath = new URL('./backfill-sharded.js', import.meta.url).pathname;

  const cases = [
    {
      name: 'skip-heavy',
      start: Math.max(0, toInt(arg('skip-start', ''), tip - 1500)),
      end: Math.max(0, toInt(arg('skip-end', ''), tip)),
      skipExisting: true
    },
    {
      name: 'mixed',
      start: Math.max(0, toInt(arg('mixed-start', ''), tip - 100000)),
      end: Math.max(0, toInt(arg('mixed-end', ''), tip - 80000)),
      skipExisting: true
    },
    {
      name: 'dense',
      start: Math.max(0, toInt(arg('dense-start', ''), tip - 300000)),
      end: Math.max(0, toInt(arg('dense-end', ''), tip - 299000)),
      skipExisting: false
    }
  ].filter((c) => c.end >= c.start);

  const results = [];
  for (const c of cases) {
    const args = [
      scriptPath,
      '--execution-mode=single-writer',
      '--shards=12',
      '--parallel-per-shard=2',
      '--mode=core-fast',
      '--with-address=false',
      '--with-social=false',
      '--with-snapshots=false',
      '--raw-json=none',
      '--snapshot-every-blocks=0',
      '--snapshot-every-ms=0',
      '--refresh-snapshots-on-complete=false',
      '--retries=2',
      '--backoff-ms=100',
      '--backoff-multiplier=1.5',
      '--max-backoff-ms=2000',
      `--skip-existing=${c.skipExisting ? 'true' : 'false'}`,
      `--start-height=${c.start}`,
      `--end-height=${c.end}`
    ];
    console.log(`[benchmark] running case=${c.name} range=${c.start}..${c.end}`);
    const out = await runCase(c.name, args);
    results.push(out);
  }

  printReport(results, minRate, maxLocks);
  const failed = results.some((r) => {
    const rate = Math.max(r.aggRate, r.doneRate);
    const ratePass = r.name === 'skip-heavy' || r.indexed === 0 ? true : rate >= minRate;
    const lockPass = r.lockErrors <= maxLocks;
    return !(r.code === 0 && ratePass && lockPass);
  });
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[benchmark:gates] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

