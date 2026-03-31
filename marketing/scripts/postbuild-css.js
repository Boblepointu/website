'use strict';
const fs = require('fs');
const { ASSET_VERSION } = require('./build/io/templates');
const cssPath = 'dist/assets/css/main.css';
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace(/url\((['"]?)(\.\.\/fonts\/[^)'"]+)\1\)/g, (_, q, path) => `url(${q}${path}?v=${ASSET_VERSION}${q})`);
fs.writeFileSync(cssPath, css);
