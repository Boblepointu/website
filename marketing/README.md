# Lotusia Marketing (Static)

Static marketing site generator for [Lotusia](https://lotusia.org) — a decentralized reputation protocol where communities burn to vote and build transparent on-chain reputation.

This folder builds a fully static website from YAML + Markdown + HTML templates, and outputs deployable files to `marketing/dist`. The site serves as the primary web presence for the Lotusia ecosystem, including documentation for burn-to-vote mechanics, Sybil-neutral ranking algorithms, and on-chain reputation scoring.

## Stack

- Node.js scripts (`scripts/build.js`)
- Content: `content/*.yml` and `content/**/*.md`
- Templates: `templates/*.html`
- Styling: Tailwind (`assets/css/input.css`)

## Local build

```bash
cd marketing
npm ci
npm run build
```

Output is generated in `marketing/dist/`.

## Production domain for SEO

Canonical URLs, `hreflang`, sitemap links, and JSON-LD URL fields are driven by `SITE_URL`.

- Default: `https://lotusia.org`
- Override example:

```bash
SITE_URL=https://staging.example.org npm run build
```

## Cloudflare Pages deploy (manual)

```bash
cd marketing
SITE_URL=https://lotusia.org npm run build
npx wrangler pages deploy dist/ --project-name=lotusia-marketing --branch=main
```

Matthew quick deploy script:

```bash
cd marketing
export CLOUDFLARE_API_TOKEN="cfat_xxx"
./scripts/deploy_matthew.sh
```

Optional apex/www cutover via Cloudflare API (destructive):

```bash
cd marketing
export CLOUDFLARE_API_TOKEN="cfat_xxx"
CUTOVER_APEX=1 CONFIRM_CUTOVER=YES ./scripts/deploy_matthew.sh
```

Preview only (no API writes):

```bash
DRY_RUN=1 CUTOVER_APEX=1 CONFIRM_CUTOVER=YES ./scripts/deploy_matthew.sh
```

## GitHub Actions CI/CD

Workflow: `.github/workflows/marketing-pages.yml`

- PR to `main` touching `marketing/**` -> build validation
- Push to `main` touching `marketing/**` -> build + deploy to Cloudflare Pages
- `SITE_URL` is set to `https://lotusia.org` in CI build steps

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## What is left for upstream merge and go-live on lotusia.org

These are external configuration tasks (outside code) that Matthew should verify:

1. **Cloudflare Pages project**
   - Confirm project name in workflow matches upstream (`lotusia-marketing`).
   - If upstream uses a different project name, update workflow deploy command.

2. **GitHub secrets in upstream repo**
   - Add `CLOUDFLARE_API_TOKEN` with Pages deploy permissions for the target account.
   - Add `CLOUDFLARE_ACCOUNT_ID` for the same account.

3. **Custom domain binding**
   - In Cloudflare Pages, bind custom domain `lotusia.org` (and preferred `www` behavior).
   - Ensure DNS points to the Pages project.

4. **Canonical host policy**
   - Enforce one canonical host with redirects (for example `www` -> apex, or apex -> `www`).
   - Keep protocol forced to HTTPS.

5. **Post-merge validation**
   - Run workflow on upstream `main`.
   - Confirm generated page source uses `https://lotusia.org` in:
     - canonical tags
     - `hreflang` links
     - sitemap URLs
     - JSON-LD URL fields

If all 5 are done, the PR is production-ready for `lotusia.org` SEO.
