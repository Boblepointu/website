#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const project = process.env.SQLITECLOUD_PROJECT || 'ceejxejkvz.g1.sqlite.cloud';
const database = process.env.SQLITECLOUD_DATABASE || process.env.SQLITECLOUD_DB_NAME || 'lotusia';
const apiKey = process.env.SQLITECLOUD_API_KEY;
const fallbackExplorerBase = process.env.FALLBACK_EXPLORER_API_BASE || 'https://explorer.lotusia.org';
const fallbackSocialBase = process.env.FALLBACK_SOCIAL_API_BASE || '';

if (!apiKey) {
  console.error('SQLITECLOUD_API_KEY is required');
  process.exit(1);
}

const files = [
  'edge-functions/api-router.ts',
  'edge-functions/explorer-overview.ts',
  'edge-functions/explorer-blocks.ts',
  'edge-functions/social-profiles.ts',
  'edge-functions/social-activity.ts'
];

async function deployOne(file) {
  const abs = resolve(process.cwd(), file);
  const slug = basename(file).replace(/\.(ts|js|mjs)$/, '');
  const raw = readFileSync(abs, 'utf-8');
  const code = raw
    .replaceAll('__SQLITECLOUD_API_KEY__', apiKey)
    .replaceAll('__SQLITECLOUD_PROJECT__', project)
    .replaceAll('__SQLITECLOUD_DATABASE__', database)
    .replaceAll('__FALLBACK_EXPLORER_API_BASE__', fallbackExplorerBase)
    .replaceAll('__FALLBACK_SOCIAL_API_BASE__', fallbackSocialBase);
  const endpoint = `https://${project}:443/v2/functions/${encodeURIComponent(slug)}`;
  const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      code,
      type: 'typescript'
    })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Deploy ${slug} failed ${res.status}: ${text}`);
  }
  return { slug, status: res.status, body: text };
}

async function main() {
  const results = [];
  for (const file of files) {
    const out = await deployOne(file);
    results.push(out);
    console.log(`[ok] deployed ${out.slug} (HTTP ${out.status})`);
  }
  console.log(JSON.stringify(results.map((r) => ({ slug: r.slug, status: r.status })), null, 2));
}

main().catch((err) => {
  console.error('[deploy:functions] failed:', err?.message || err);
  process.exit(1);
});

