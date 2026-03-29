# Explorer 1:1 Parity Report (SQLite-only Path)

## Deployment

- SQLite edge functions deployed: `api-router`, `explorer-overview`, `explorer-blocks`, `social-profiles`, `social-activity`
- Demo Pages deployed: `https://afdcd29a.lotusia-demo.pages.dev`

## Hard Gate Checks

- **Migrations**: passed (`001`..`009` applied successfully)
- **Explain plans**: passed (no fully unindexed sampled query paths)
- **RANK repair path**: passed (`npm run repair:rank -- --window 50` -> `ok=50`, `fail=0`)
- **Local API smoke**: passed on new parity families:
  - `/api/explorer/stats/cards`
  - `/api/explorer/stats/charts?period=day`
  - `/api/explorer/richlist/balance`
  - `/api/explorer/richlist/received`
  - `/api/explorer/richlist/wealth`
  - `/api/explorer/network/peers`
  - `/api/explorer/network/nodes`

## Live Smoke Notes

- Direct smoke checks from this environment against `demo.lotusia.org` and the temporary `pages.dev` URL returned HTTP `403`, so local contract verification was used as the hard functional gate.
- Runtime explorer fallback is disabled in the worker API path; explorer pages now require SQLite edge responses and do not silently drop to legacy explorer APIs.

## Files Added/Updated for Parity

- Contract artifacts: `docs/explorer-parity-matrix.json`, `docs/explorer-parity-matrix.md`
- Schema/indexes: `schema/008_explorer_parity_tables.sql`, `schema/009_explorer_parity_indexes.sql`
- Ingestion/materialization:
  - `src/ingest/index-block.js`
  - `src/ingest/hydrate-worker.js`
  - `src/ingest/repair-rank-projections.js`
  - `src/rank/decode.js`
- API parity:
  - `src/api/contract.js`
  - `edge-functions/api-router.ts`
- Demo renderer parity pages:
  - `marketing-demo/scripts/build/worker/explorer-render.js`
  - `marketing-demo/scripts/build/worker/router.js`
  - `marketing-demo/scripts/build/worker/html.js`
  - `marketing-demo/scripts/build/worker/proxy.js`
