import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { closeDb, sql } from '../db/client.js';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function argFromList(args, name, fallback = '') {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function countShardHeights(start, end, shardIndex, shardCount) {
  const first = start + shardIndex;
  if (first > end) return 0;
  return Math.floor((end - first) / shardCount) + 1;
}

function nowIso() {
  return new Date().toISOString();
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

function parseRate(line) {
  const m = line.match(/rate=([0-9.]+)\s+blk\/s/);
  return m ? Number(m[1]) : NaN;
}

function parseCounts(line) {
  const indexed = Number((line.match(/indexed=([0-9]+)/) || [])[1] || 0);
  const skipped = Number((line.match(/skipped=([0-9]+)/) || [])[1] || 0);
  const failed = Number((line.match(/failed=([0-9]+)/) || [])[1] || 0);
  return { indexed, skipped, failed };
}

function looksLikeSqliteDriverTraceLine(line) {
  const s = String(line || '');
  return (
    s.includes('processCommandsData - error:') ||
    s.includes('processCommandsFinish - error') ||
    s.includes('at parseError') ||
    s.includes('at popData') ||
    s.includes('at SQLiteCloudTlsConnection') ||
    s.includes('at TLSSocket.') ||
    s.includes('at addChunk') ||
    s.includes('at Readable.push') ||
    s.includes('at TLSWrap.onStreamRead') ||
    s.includes('errorCode:') ||
    s.includes('externalErrorCode:') ||
    s.includes('offsetCode:') ||
    s.trim() === '}'
  );
}

async function main() {
  const shards = Math.max(1, Math.min(32, toInt(arg('shards', '8'), 8)));
  const parallelPerShard = Math.max(1, Math.min(16, toInt(arg('parallel-per-shard', '1'), 1)));
  const executionMode = String(arg('execution-mode', 'single-writer')).trim().toLowerCase();
  const singleWriterMaxParallel = Math.max(1, Math.min(64, toInt(arg('single-writer-max-parallel', '16'), 16)));
  const singleWriterMaxPendingBlocks = Math.max(8, Math.min(2000, toInt(arg('single-writer-max-pending-blocks', '128'), 128)));
  const configuredMaxActiveShards = Math.max(1, Math.min(shards, toInt(arg('max-active-shards', String(Math.min(shards, 4))), Math.min(shards, 4))));
  const minActiveShards = Math.max(1, Math.min(configuredMaxActiveShards, toInt(arg('min-active-shards', '2'), 2)));
  const lockSpikeThreshold = Math.max(1, toInt(arg('lock-spike-threshold', '3'), 3));
  const startStaggerMs = Math.max(0, Math.min(5000, toInt(arg('start-stagger-ms', '400'), 400)));
  const startedAt = Date.now();

  const passthroughArgs = process.argv
    .slice(2)
    .filter(
      (a) =>
        !a.startsWith('--shards=') &&
        !a.startsWith('--parallel-per-shard=') &&
        !a.startsWith('--max-active-shards=') &&
        !a.startsWith('--start-stagger-ms=')
    );

  const scriptPath = new URL('./backfill-last-5000.js', import.meta.url).pathname;
  const shardState = Array.from({ length: shards }, () => ({
    rate: 0,
    indexed: 0,
    skipped: 0,
    failed: 0,
    lockErrors: 0,
    lastLoggedLockCount: 0,
    suppressTraceLines: 0,
    done: false
  }));

  console.log(
    `[${nowIso()}] [sharded] start mode=${executionMode} shards=${shards} parallelPerShard=${parallelPerShard} maxActiveShards=${configuredMaxActiveShards} startStaggerMs=${startStaggerMs} ` +
      `cmd=node ${scriptPath} ...`
  );

  if (executionMode === 'single-writer') {
    const singleParallel = Math.max(1, Math.min(singleWriterMaxParallel, shards * parallelPerShard));
    const args = [
      scriptPath,
      ...passthroughArgs.filter((a) => !a.startsWith('--parallel=') && !a.startsWith('--shard-count=') && !a.startsWith('--shard-index=')),
      `--parallel=${singleParallel}`,
      `--max-pending-blocks=${singleWriterMaxPendingBlocks}`,
      `--shard-count=1`,
      `--shard-index=0`
    ];
    console.log(`[${nowIso()}] [single-writer] launch parallel=${singleParallel} maxPendingBlocks=${singleWriterMaxPendingBlocks}`);
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const outRl = readline.createInterface({ input: child.stdout });
    outRl.on('line', (line) => console.log(`[single] ${line}`));
    const errRl = readline.createInterface({ input: child.stderr });
    errRl.on('line', (line) => console.error(`[single:err] ${line}`));
    const result = await new Promise((resolve) => {
      child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal: signal || '' }));
    });
    if (result.code !== 0) {
      console.error(`[single-writer] failed: code=${result.code} signal=${result.signal}`);
      process.exitCode = 1;
    } else {
      console.log(`[${nowIso()}] [single-writer] completed elapsed=${formatDuration(Date.now() - startedAt)}`);
    }
    return;
  }

  const exits = [];
  const skipExisting = String(argFromList(passthroughArgs, 'skip-existing', 'true')).toLowerCase() !== 'false';
  const startHeightRaw = String(argFromList(passthroughArgs, 'start-height', argFromList(passthroughArgs, 'start', '')) || '').trim();
  const endHeightRaw = String(argFromList(passthroughArgs, 'end-height', argFromList(passthroughArgs, 'end', '')) || '').trim();
  const hasBoundedRange = startHeightRaw !== '' && endHeightRaw !== '';
  let allowedShards = Array.from({ length: shards }, (_, i) => i);
  if (skipExisting && hasBoundedRange) {
    const start = Math.max(0, toInt(startHeightRaw, 0));
    const end = Math.max(start, toInt(endHeightRaw, start));
    const rows = await sql(
      `SELECT ((b.height - ?) % ?) AS shard, COUNT(*) AS indexed
       FROM blocks b
       WHERE b.height BETWEEN ? AND ?
         AND EXISTS (
           SELECT 1
           FROM transactions t
           WHERE t.block_height = b.height
         )
       GROUP BY shard`,
      start,
      shards,
      start,
      end
    );
    const indexedByShard = new Map();
    for (const r of rows || []) {
      indexedByShard.set(toInt(r?.shard, -1), toInt(r?.indexed, 0));
    }
    allowedShards = allowedShards.filter((shardId) => {
      const total = countShardHeights(start, end, shardId, shards);
      const preIndexed = indexedByShard.get(shardId) || 0;
      return total - preIndexed > 0;
    });
    console.log(
      `[${nowIso()}] [sharded] preflight range=${start}..${end} launchable_shards=${allowedShards.length}/${shards}`
    );
    await closeDb();
  }

  async function runShard(i) {
    const args = [
      scriptPath,
      ...passthroughArgs,
      `--parallel=${parallelPerShard}`,
      `--shard-count=${shards}`,
      `--shard-index=${i}`
    ];
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const outRl = readline.createInterface({ input: child.stdout });
    outRl.on('line', (line) => {
      const rate = parseRate(line);
      if (Number.isFinite(rate)) shardState[i].rate = rate;
      const counts = parseCounts(line);
      if (counts.indexed >= 0) shardState[i].indexed = counts.indexed;
      if (counts.skipped >= 0) shardState[i].skipped = counts.skipped;
      if (counts.failed >= 0) shardState[i].failed = counts.failed;
      console.log(`[shard:${i}] ${line}`);
    });
    const errRl = readline.createInterface({ input: child.stderr });
    errRl.on('line', (line) => {
      const msg = String(line || '');
      if (msg.toLowerCase().includes('database is locked')) {
        shardState[i].lockErrors += 1;
        shardState[i].suppressTraceLines = 24;
        const c = shardState[i].lockErrors;
        const shouldLog = c <= 2 || c - shardState[i].lastLoggedLockCount >= 25;
        if (shouldLog) {
          shardState[i].lastLoggedLockCount = c;
          console.warn(`[shard:${i}] [lock] transient database lock; retrying (count=${c})`);
        }
        return;
      }
      if (shardState[i].suppressTraceLines > 0) {
        shardState[i].suppressTraceLines -= 1;
        return;
      }
      if (looksLikeSqliteDriverTraceLine(msg)) return;
      console.error(`[shard:${i}:err] ${msg}`);
    });
    const result = await new Promise((resolve) => {
      child.on('exit', (code, signal) => {
        shardState[i].done = true;
        resolve({ shard: i, code: code ?? 1, signal: signal || '' });
      });
    });
    exits.push(result);
  }

  let nextShard = 0;
  const running = new Set();
  let currentMaxActiveShards = configuredMaxActiveShards;
  let previousLockCount = 0;
  let noLockIntervals = 0;
  async function launchLoop() {
    while (nextShard < allowedShards.length || running.size > 0) {
      while (nextShard < allowedShards.length && running.size < currentMaxActiveShards) {
        const shardId = allowedShards[nextShard];
        nextShard += 1;
        const p = runShard(shardId).finally(() => {
          running.delete(p);
        });
        running.add(p);
        if (startStaggerMs > 0) {
          await sleep(startStaggerMs);
        }
      }
      if (running.size > 0) {
        await Promise.race(Array.from(running));
      }
    }
  }

  const timer = setInterval(() => {
    const aggRate = shardState.reduce((s, x) => s + (x.rate || 0), 0);
    const aggIndexed = shardState.reduce((s, x) => s + (x.indexed || 0), 0);
    const aggSkipped = shardState.reduce((s, x) => s + (x.skipped || 0), 0);
    const aggFailed = shardState.reduce((s, x) => s + (x.failed || 0), 0);
    const aggLocks = shardState.reduce((s, x) => s + (x.lockErrors || 0), 0);
    const lockDelta = aggLocks - previousLockCount;
    previousLockCount = aggLocks;
    if (lockDelta >= lockSpikeThreshold && currentMaxActiveShards > minActiveShards) {
      currentMaxActiveShards -= 1;
      noLockIntervals = 0;
      console.log(
        `[${nowIso()}] [adaptive] lock_spike=${lockDelta} reducing active shard cap -> ${currentMaxActiveShards}`
      );
    } else if (lockDelta === 0 && currentMaxActiveShards < configuredMaxActiveShards) {
      noLockIntervals += 1;
      if (noLockIntervals >= 3) {
        currentMaxActiveShards += 1;
        noLockIntervals = 0;
        console.log(
          `[${nowIso()}] [adaptive] stable locks=0 increasing active shard cap -> ${currentMaxActiveShards}`
        );
      }
    } else {
      noLockIntervals = 0;
    }
    const done = shardState.filter((x) => x.done).length;
    const active = running.size;
    console.log(
      `[${nowIso()}] [sharded] shards_done=${done}/${allowedShards.length} active=${active} cap=${currentMaxActiveShards} ` +
        `agg_rate=${aggRate.toFixed(2)} blk/s indexed=${aggIndexed} skipped=${aggSkipped} failed=${aggFailed} locks=${aggLocks} ` +
        `elapsed=${formatDuration(Date.now() - startedAt)}`
    );
  }, 5000);

  await launchLoop();

  clearInterval(timer);

  const failures = exits.filter((x) => x.code !== 0);
  const failedShards = shardState
    .map((s, i) => ({ shard: i, failed: s.failed || 0 }))
    .filter((s) => s.failed > 0);
  if (failures.length > 0) {
    console.error(`[sharded] failed shards: ${JSON.stringify(failures)}`);
    process.exitCode = 1;
    return;
  }
  if (failedShards.length > 0) {
    console.error(`[sharded] shards completed with failed heights: ${JSON.stringify(failedShards)}`);
    process.exitCode = 1;
    return;
  }

  const aggRate = shardState.reduce((s, x) => s + (x.rate || 0), 0);
  const aggLocks = shardState.reduce((s, x) => s + (x.lockErrors || 0), 0);
  console.log(
    `[${nowIso()}] [sharded] completed shards=${allowedShards.length}/${allowedShards.length} ` +
      `agg_rate=${aggRate.toFixed(2)} blk/s lock_errors=${aggLocks} elapsed=${formatDuration(Date.now() - startedAt)}`
  );
}

main().catch((err) => {
  console.error('[sharded] failed:', err?.message || err);
  process.exitCode = 1;
});

