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
  - Parallel window tuning: `npm run backfill:last5000 -- --parallel=12 --retries=4 --backoff-ms=400 --backoff-multiplier=1.8 --max-backoff-ms=8000`
  - Note: this script disables event-bus writes by default (`DISABLE_EVENT_BUS=true`) to avoid offset collisions under high parallelism.
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
- `FALLBACK_EXPLORER_API_BASE`: fallback explorer API base for read-through misses.
- `FALLBACK_SOCIAL_API_BASE`: fallback social API base for read-through misses.
- `EXPLORER_FALLBACK_BASE`: raw explorer API base used by hydration worker fallback.
- `SQLITE_EDGE_FUNCTIONS_BASE`: SQLite Cloud functions base URL for demo worker.
- `SQLITE_EDGE_FUNCTIONS_API_KEY`: API key used by demo worker to call `api-router`.

## Demo module layout

- `marketing-demo/`: static generator + worker clone, scoped to `demo.lotusia.org`.
- `edge-functions/api-router.ts`: full explorer/social API contract, DB-first with fallback + hydrate queue.
- `docs/demo-lotusia-pages-runbook.md`: deployment and domain attach checklist.

