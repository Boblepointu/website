# demo.lotusia.org Pages runbook

## 1) Prerequisites

- Cloudflare account with `Pages:Edit` and `Workers Scripts:Edit`.
- SQLite Cloud API key with access to `lotusia` database.
- Local env vars:
  - `CLOUDFLARE_API_TOKEN`
  - `CF_PAGES_PROJECT` (example: `lotusia-demo`)
  - `CF_PAGES_BRANCH` (default: `main`)
  - `SITE_URL=https://demo.lotusia.org`
  - `SQLITE_EDGE_FUNCTIONS_BASE=https://<project>:443/v2/functions`
  - `SQLITE_EDGE_FUNCTIONS_API_KEY=<sqlite-cloud-api-key>`
  - `SQLITE_EDGE_API_BASE=https://invalid.local` (intentionally unused for explorer, keep non-routable for guardrail)
  - `LEGACY_API_BASE=https://invalid.local` (same guardrail)

## 2) Deploy SQLite edge functions

From `sqlite-cloud-edge`:

```bash
export SQLITECLOUD_PROJECT="<project>.g1.sqlite.cloud"
export SQLITECLOUD_DATABASE="lotusia"
export SQLITECLOUD_API_KEY="<key>"
export FALLBACK_EXPLORER_API_BASE="https://explorer.lotusia.org"
export FALLBACK_SOCIAL_API_BASE=""
npm run deploy:functions
```

This deploys `api-router` plus compatibility functions.

## 3) Build + deploy demo Pages project

```bash
export CLOUDFLARE_API_TOKEN="<cf-token>"
export CF_PAGES_PROJECT="lotusia-demo"
export CF_PAGES_BRANCH="main"
export SITE_URL="https://demo.lotusia.org"
npm run demo:deploy
```

## 4) Pages project vars

Set these env vars on the Pages project (Production + Preview):

- `SQLITE_EDGE_FUNCTIONS_BASE`
- `SQLITE_EDGE_FUNCTIONS_API_KEY`
- `SQLITE_EDGE_API_BASE`
- `LEGACY_API_BASE`

Recommended values for strict parity mode:

- `SQLITE_EDGE_FUNCTIONS_BASE=https://<project>.g1.sqlite.cloud:443/v2/functions`
- `SQLITE_EDGE_FUNCTIONS_API_KEY=<sqlite-cloud-api-key>`
- `SQLITE_EDGE_API_BASE=https://invalid.local`
- `LEGACY_API_BASE=https://invalid.local`

## 5) Domain attach

1. Cloudflare Dashboard -> Pages -> `lotusia-demo`.
2. Custom domains -> Add `demo.lotusia.org`.
3. Ensure DNS CNAME/flattening points to Pages target.
4. Wait for TLS active, then smoke test.

