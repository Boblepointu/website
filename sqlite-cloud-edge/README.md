# lotusia-sqlite-cloud-edge

SQLite Cloud-backed explorer/social data service for Lotusia.

## Goals

- Create and use a SQLite Cloud database named `lotusia`.
- Ingest blockchain data from Lotus-compatible API routes.
- Store protocol-agnostic OP_RETURN events for multiple protocols.
- Derive social read models from protocol decoders (RANK now, others later).
- Expose `/api/explorer/*` and `/api/social/*` compatible APIs.
- Support event-bus processing (Kafka-like) using SQLite Cloud pub/sub + persisted event log.

## Setup

1. Copy `.env.example` to `.env` and fill credentials.
2. Install dependencies:
   - `npm install`
3. Create DB and run migrations:
   - `npm run bootstrap:db`
   - `npm run migrate`

## Run

- Local API server: `npm run dev:api`
- One-shot latest block sync: `npm run seed:tip`
- Backfill range: `npm run backfill -- --start=1200000 --end=1200100`
- Backfill latest 5000 blocks (local runner): `npm run backfill:last5000`
  - Architecture: `parallel` controls fetch/decode workers; DB writes are funneled through a single ordered writer queue per process.
  - Parallel window tuning: `npm run backfill:last5000 -- --parallel=12 --retries=4 --backoff-ms=400 --backoff-multiplier=1.8 --max-backoff-ms=8000`
  - Range mode (from a specific height to tip): `npm run backfill:last5000 -- --start-height=1200000`
  - Explicit bounded range: `npm run backfill:last5000 -- --start-height=1200000 --end-height=1205000`
  - Ingest mode: `--mode=core-fast` (fast raw chain ingest, default) or `--mode=full-projection` (includes social/domain/address projections)
  - Projection toggles: `--with-address=true|false --with-social=true|false --with-snapshots=true|false`
  - Raw payload policy: `--raw-json=none|minimal|full`
  - Batch-size knobs (important for 1000+ tx blocks): `--sql-chunk-size=420 --prevout-chunk-size=240 --delta-chunk-size=420`
  - Writer commit grouping: `--writer-commit-batch=8` (core-fast default) to commit multiple blocks per DB transaction
  - Memory guardrail: `--max-pending-blocks=128` caps fetched-block buffer to prevent OOM on very large ranges
  - Fast rerun mode is enabled by default: `--skip-existing=true` (set `--skip-existing=false` to force full reindex of already-indexed heights)
  - Snapshot refresh knobs: `--snapshot-every-blocks=10000 --snapshot-every-ms=600000 --refresh-snapshots-on-complete=true`
  - Multi-process sharding knobs (run multiple processes in parallel): `--shard-count=8 --shard-index=0..7`
  - Skip prefilter is shard-aware (`height` partitioned per shard) to reduce startup overhead on skip-heavy reruns.
  - Source priority: `CHRONIK_BASE_URL` (default `https://chronik.lotusia.org`) first, Explorer fallback second.
  - Note: this script disables event-bus writes by default (`DISABLE_EVENT_BUS=true`) to avoid offset collisions under high parallelism.
- Sharded launcher (controller): `npm run backfill:sharded -- --execution-mode=single-writer --shards=12 --parallel-per-shard=2 --start-height=1200000 --end-height=1300000 --mode=core-fast --raw-json=none`
  - `execution-mode=single-writer` (recommended): one process with global single writer queue and many fetch workers.
  - Single-writer memory tuning: `--single-writer-max-parallel=16 --single-writer-max-pending-blocks=128`
  - `execution-mode=multi-process` (legacy): multi-process shard runners, with adaptive contention control.
  - Contention control: `--max-active-shards=4 --min-active-shards=2 --start-stagger-ms=400 --lock-spike-threshold=3`
  - Transient lock handling is automatic with retry/backoff. Optional tuning via env:
    - `DB_LOCK_RETRIES` (default `24`)
    - `DB_LOCK_BACKOFF_MS` (default `25`)
    - `DB_LOCK_BACKOFF_MULTIPLIER` (default `1.7`)
    - `DB_LOCK_MAX_BACKOFF_MS` (default `2000`)
- Benchmark and acceptance gates: `npm run benchmark:gates -- --min-rate=30 --max-locks=0`
- Ready presets:
  - Skip-heavy catch-up: `npm run backfill:sharded -- --execution-mode=single-writer --shards=12 --parallel-per-shard=2 --mode=core-fast --skip-existing=true --with-address=false --with-social=false --with-snapshots=false --raw-json=none`
  - Dense reindex/high-TX: `npm run backfill:sharded -- --execution-mode=single-writer --shards=16 --parallel-per-shard=2 --mode=core-fast --skip-existing=false --with-address=false --with-social=false --with-snapshots=false --raw-json=none --writer-commit-batch=12`
- Process queued API-miss hydration jobs once: `npm run hydrate:once -- 50`
- Build demo static+worker bundle: `npm run demo:build`
- Deploy demo Pages project: `npm run demo:deploy`

## Important env vars

- `SQLITECLOUD_ADMIN_URL`: server-level URL (no db path) used for `CREATE DATABASE`.
- `SQLITECLOUD_DB_NAME`: defaults to `lotusia`.
- `SQLITECLOUD_DB_URL`: database URL with `/lotusia`.
- `SQLITECLOUD_HOST` + `SQLITECLOUD_API_KEY`: alternative to full URL credentials.
- `LOTUS_API_BASE_URL`: Lotus API route base.
- `LOTUS_API_AUTH_TOKEN`: optional bearer token for Lotus API.
- `CHRONIK_BASE_URL`: Chronik endpoint for bulk backfill (defaults to `https://chronik.lotusia.org`).
- `FALLBACK_EXPLORER_API_BASE`: fallback explorer API base for read-through misses.
- `FALLBACK_SOCIAL_API_BASE`: fallback social API base for read-through misses.
- `EXPLORER_FALLBACK_BASE`: raw explorer API base used by hydration worker fallback.
- `SQLITE_EDGE_FUNCTIONS_BASE`: SQLite Cloud functions base URL for demo worker.
- `SQLITE_EDGE_FUNCTIONS_API_KEY`: API key used by demo worker to call `api-router`.

## Demo module layout

- `marketing-demo/`: static generator + worker clone, scoped to `demo.lotusia.org`.
- `edge-functions/api-router.ts`: full explorer/social API contract, DB-first with fallback + hydrate queue.
- `docs/demo-lotusia-pages-runbook.md`: deployment and domain attach checklist.

