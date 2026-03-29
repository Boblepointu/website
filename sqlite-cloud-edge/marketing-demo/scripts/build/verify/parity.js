'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DIST = path.join(ROOT, 'dist');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(path.join(DIST, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(DIST, file));
}

function verifyArtifacts() {
  const required = ['_worker.js', '_redirects', 'robots.txt', 'sitemap.xml', '_worker-safelist.html'];
  for (const file of required) {
    assert(exists(file), `Missing dist artifact: ${file}`);
  }
}

function verifyWorkerContracts() {
  const worker = read('_worker.js');
  const requiredSnippets = [
    "path.startsWith('/explorer/')",
    "path.startsWith('/social/')",
    "path.startsWith('/api/_')",
    "path.startsWith('/api/')",
    "path.startsWith('/_nuxt/')",
    "parseAvatarPath(path)",
    "env.ASSETS.fetch(request)"
  ];
  for (const snippet of requiredSnippets) {
    assert(worker.includes(snippet), `Worker contract missing snippet: ${snippet}`);
  }
}

function verifySeoContracts() {
  const robots = read('robots.txt');
  assert(robots.includes('Sitemap: https://lotusia.org/sitemap.xml'), 'robots.txt sitemap URL mismatch');
  const sitemap = read('sitemap.xml');
  assert(sitemap.includes('<urlset'), 'sitemap.xml malformed');
  assert(sitemap.includes('x-default'), 'sitemap.xml missing x-default alternates');
}

function main() {
  verifyArtifacts();
  verifyWorkerContracts();
  verifySeoContracts();
  process.stdout.write('Parity verification passed.\n');
}

main();
