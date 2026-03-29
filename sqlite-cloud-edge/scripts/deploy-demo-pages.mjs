#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const demoDir = resolve(root, 'marketing-demo');
const distDir = resolve(demoDir, 'dist');
const project = process.env.CF_PAGES_PROJECT || 'lotusia-demo';
const branch = process.env.CF_PAGES_BRANCH || 'main';
const siteUrl = process.env.SITE_URL || 'https://demo.lotusia.org';

function run(cmd, args, cwd) {
  const out = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (out.status !== 0) process.exit(out.status || 1);
}

console.log(`[demo:deploy] building marketing-demo with SITE_URL=${siteUrl}`);
run('npm', ['run', 'build'], demoDir);

console.log(`[demo:deploy] deploying ${distDir} to ${project} (${branch})`);
run('npx', ['wrangler', 'pages', 'deploy', distDir, '--project-name', project, '--branch', branch], root);

console.log('[demo:deploy] success');

