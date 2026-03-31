'use strict';

const fs = require('fs');
const path = require('path');
const { readTemplate } = require('./content');

const ASSET_VERSION = Date.now().toString(36);

function fill(tmpl, vars) {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(String(v ?? ''));
  return out;
}

function versionAssetUrls(html) {
  const v = ASSET_VERSION;
  html = html.replace(/((?:href|src)=")(\/assets\/[^"?]+)(")/g, `$1$2?v=${v}$3`);
  html = html.replace(/(\/assets\/[^\s"]+\.(?:webp|png|jpe?g|gif|svg|avif))\s+(\d+[wx])/g, `$1?v=${v} $2`);
  html = html.replace(/(imagesrcset="[^"]*?)(\/assets\/[^\s"]+\.(?:webp|png|jpe?g))\s+(\d+w)/g, function(m, pre, url, w) {
    return `${pre}${url}?v=${v} ${w}`;
  });
  return html;
}

function renderPage(templatesDir, templateName, vars) {
  const pageTmpl = readTemplate(templatesDir, templateName);
  const headerTmpl = fs.readFileSync(path.join(templatesDir, 'partials/header.html'), 'utf8');
  const footerTmpl = fs.readFileSync(path.join(templatesDir, 'partials/footer.html'), 'utf8');
  const header = fill(headerTmpl, vars);
  const footer = fill(footerTmpl, vars);
  let html = fill(pageTmpl, { ...vars, header, footer });
  return versionAssetUrls(html);
}

module.exports = {
  fill,
  renderPage,
  ASSET_VERSION,
  versionAssetUrls
};
