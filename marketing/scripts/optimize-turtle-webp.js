'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const py = path.join(__dirname, 'optimize-turtle-webp.py');
const r = spawnSync('python3', [py], { stdio: 'inherit', encoding: 'utf8' });
if (r.status !== 0 && r.status !== null) {
  console.warn('optimize-turtle-webp: non-zero exit', r.status);
}
