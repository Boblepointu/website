# Build Contract

This document captures invariant outputs and route contracts that the modular build must preserve.

## Required dist Artifacts

- `dist/_worker.js`
- `dist/_redirects`
- `dist/sitemap.xml`
- `dist/robots.txt`
- `dist/_worker-safelist.html`
- `dist/assets/**`

## SEO Contract

- Canonical site URL is `https://lotusia.org`
- `sitemap.xml` includes language alternates and `x-default`
- `robots.txt` points to `https://lotusia.org/sitemap.xml`
- Worker-rendered social/explorer pages include canonical/meta/OG/JSON-LD data

## Worker Route Matrix (must stay served by `_worker.js`)

- `/social/*`
- `/explorer/*`
- `/api/*` and `/api/_*` proxy behavior
- `/_avatar/*` avatar cache/proxy behavior
- `/_nuxt/*` legacy assets proxy behavior

## Verification

- Run normal build:
  - `npm run build`
- Run parity checks:
  - `node scripts/build/verify/parity.js`
