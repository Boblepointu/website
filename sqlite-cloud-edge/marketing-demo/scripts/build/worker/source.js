'use strict';

const fs = require('fs');
const path = require('path');

const SEGMENTS = [
  'proxy.js',
  'html.js',
  'helpers.js',
  'explorer-render.js',
  'social-render.js',
  'router.js'
];

function getWorkerSource() {
  const dir = __dirname;
  const i18nDir = path.resolve(dir, '..', '..', '..', 'i18n');
  const i18nFiles = fs.readdirSync(i18nDir).filter((name) => name.endsWith('.json'));
  const i18nPayload = i18nFiles.reduce((acc, name) => {
    const lang = path.basename(name, '.json');
    const raw = fs.readFileSync(path.join(i18nDir, name), 'utf8');
    acc[lang] = JSON.parse(raw);
    return acc;
  }, {});
  const parts = SEGMENTS.map((name) => fs.readFileSync(path.join(dir, name), 'utf8'));
  return [
    'const WORKER_I18N = ' + JSON.stringify(i18nPayload) + ';',
    parts.join('\n\n')
  ].join('\n\n');
}

module.exports = { getWorkerSource };
