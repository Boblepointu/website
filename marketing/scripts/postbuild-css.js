'use strict';
const fs = require('fs');
const path = require('path');
const Critters = require('critters');
const { ASSET_VERSION } = require('./build/io/templates');

const cssPath = 'dist/assets/css/main.css';
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace(/url\((['"]?)(\.\.\/fonts\/[^)'"]+)\1\)/g, (_, q, p) => `url(${q}${p}?v=${ASSET_VERSION}${q})`);
fs.writeFileSync(cssPath, css);

const V_RE = /(\/(assets\/css\/[^"?]+))\?v=[^"]+/g;

async function inlineCritical() {
  const critters = new Critters({
    path: 'dist',
    preload: 'media',
    inlineFonts: false,
    pruneSource: false,
    reduceInlineStyles: true,
    mergeStylesheets: true,
    compress: true
  });

  const distDir = path.resolve('dist');
  const htmlFiles = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  }
  walk(distDir);

  let count = 0;
  for (const file of htmlFiles) {
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('rel="stylesheet"')) continue;

    // Remove the redundant CSS preload (critters handles preloading)
    html = html.replace(/<link rel="preload" href="[^"]*main\.css[^"]*" as="style">\s*/g, '');

    // Strip ?v= from CSS hrefs so critters can resolve the file on disk
    const versionSuffix = `?v=${ASSET_VERSION}`;
    html = html.replace(V_RE, '$1');

    try {
      let result = await critters.process(html);
      // Restore ?v= on any remaining CSS links
      result = result.replace(/(\/assets\/css\/[^"?\s]+)(["'\s>])/g, `$1${versionSuffix}$2`);
      // Replace inline onload handlers with a CSP-safe script block
      result = result.replace(/ onload="this\.media='all'"/g, '');
      const loaderScript = "<script>document.querySelectorAll('link[media=print][rel=stylesheet]').forEach(function(l){l.onload=function(){this.media='all'}})</script>";
      result = result.replace(/(<link rel="stylesheet"[^>]*media="print"[^>]*>)/, `$1${loaderScript}`);
      // Fix noscript fallback: remove media=print and onload so it works without JS
      result = result.replace(/<noscript>\s*<link rel="stylesheet" href="([^"]+)"[^>]*>\s*<\/noscript>/g,
        '<noscript><link rel="stylesheet" href="$1"></noscript>');
      // Strip below-fold icon SVGs from inline critical CSS
      const bodyStart = result.indexOf('<body');
      const headerEnd = result.indexOf('</header>', bodyStart);
      const heroMatch = result.indexOf('fetchpriority="high"', bodyStart);
      const aboveFoldEnd = Math.max(headerEnd, heroMatch) + 500;
      const aboveFoldBody = result.substring(bodyStart, aboveFoldEnd > bodyStart ? aboveFoldEnd : bodyStart + 5000);
      const strippedBody = aboveFoldBody.replace(/<style[\s\S]*?<\/style>/g, '');
      const aboveFoldIcons = new Set((strippedBody.match(/i-heroicons-[\w-]+/g) || []));

      result = result.replace(/<style>([\s\S]*?)<\/style>/, (m, css) => {
        const cleaned = css.replace(/\.i-heroicons-[^{]+\{[^}]+\}/g, (rule) => {
          const iconName = (rule.match(/\.(i-heroicons-[\w-]+)/) || [])[1];
          return iconName && !aboveFoldIcons.has(iconName) ? '' : rule;
        });
        return `<style>${cleaned}</style>`;
      });

      fs.writeFileSync(file, result);
      count++;
    } catch (e) {
      console.warn(`  critters skip ${path.relative(distDir, file)}: ${e.message}`);
    }
  }
  console.log(`postbuild-css: inlined critical CSS in ${count} pages`);
}

inlineCritical().catch(e => { console.error(e); process.exit(1); });
