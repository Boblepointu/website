'use strict';

const fs = require('fs');
const path = require('path');

const ICON_MAP = {
  network: { style: 'solid', file: 'diagram-project.svg', symbol: 'fa-network' },
  connections: { style: 'solid', file: 'users.svg', symbol: 'fa-connections' },
  cube: { style: 'solid', file: 'cube.svg', symbol: 'fa-cube' },
  clock: { style: 'solid', file: 'clock.svg', symbol: 'fa-clock' },
  bolt: { style: 'solid', file: 'bolt.svg', symbol: 'fa-bolt' },
  gauge: { style: 'solid', file: 'gauge-high.svg', symbol: 'fa-gauge' },
  social: { style: 'solid', file: 'share-nodes.svg', symbol: 'fa-social' },
  chart: { style: 'solid', file: 'chart-line.svg', symbol: 'fa-chart' },
  profile: { style: 'solid', file: 'user.svg', symbol: 'fa-profile' },
  coins: { style: 'solid', file: 'coins.svg', symbol: 'fa-coins' },
  weight: { style: 'solid', file: 'weight-hanging.svg', symbol: 'fa-weight' },
  txs: { style: 'solid', file: 'arrows-left-right.svg', symbol: 'fa-txs' },
  flame: { style: 'solid', file: 'fire-flame-curved.svg', symbol: 'fa-flame' },
  x: { style: 'brands', file: 'x-twitter.svg', symbol: 'fa-x' },
  up: { style: 'solid', file: 'arrow-up.svg', symbol: 'fa-up' },
  down: { style: 'solid', file: 'arrow-down.svg', symbol: 'fa-down' },
  minus: { style: 'solid', file: 'minus.svg', symbol: 'fa-minus' },
  external: { style: 'solid', file: 'up-right-from-square.svg', symbol: 'fa-external' },
  prev: { style: 'solid', file: 'chevron-left.svg', symbol: 'fa-prev' },
  next: { style: 'solid', file: 'chevron-right.svg', symbol: 'fa-next' },
  fallback: { style: 'solid', file: 'circle-question.svg', symbol: 'fa-fallback' }
};

function extractViewBox(svgContent) {
  const m = svgContent.match(/viewBox="([^"]+)"/i);
  return m ? m[1] : '0 0 512 512';
}

function extractInner(svgContent) {
  return svgContent
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim();
}

function buildLocalFontAwesomeSprite(rootDir) {
  const faRoot = path.join(rootDir, 'node_modules', '@fortawesome', 'fontawesome-free', 'svgs');
  const outDir = path.join(rootDir, 'assets', 'icons', 'fa');
  const outPath = path.join(outDir, 'sprite.svg');
  fs.mkdirSync(outDir, { recursive: true });

  const symbols = Object.values(ICON_MAP).map(icon => {
    const filePath = path.join(faRoot, icon.style, icon.file);
    const svg = fs.readFileSync(filePath, 'utf8');
    const viewBox = extractViewBox(svg);
    const inner = extractInner(svg);
    return `  <symbol id="${icon.symbol}" viewBox="${viewBox}">${inner}</symbol>`;
  });

  const sprite = [
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none;">',
    ...symbols,
    '</svg>',
    ''
  ].join('\n');
  fs.writeFileSync(outPath, sprite);
}

module.exports = {
  ICON_MAP,
  buildLocalFontAwesomeSprite
};
