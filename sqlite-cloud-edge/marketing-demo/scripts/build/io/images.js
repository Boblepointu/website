'use strict';

const fs = require('fs');
const path = require('path');

function makeImageHelpers({ IMAGES_DIR }) {
  const imageMetaCache = new Map();

  function getAssetImageFilePath(src) {
    if (!src || typeof src !== 'string') return '';
    if (!src.startsWith('/assets/images/')) return '';
    const rel = decodeURIComponent(src.replace('/assets/images/', ''));
    return path.join(IMAGES_DIR, rel);
  }

  function readImageSize(filePath) {
    if (!filePath) return null;
    if (imageMetaCache.has(filePath)) return imageMetaCache.get(filePath);
    let out = null;
    try {
      const buf = fs.readFileSync(filePath);
      if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        out = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      } else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i < buf.length - 9) {
          if (buf[i] !== 0xff) { i += 1; continue; }
          const marker = buf[i + 1];
          if (marker === 0xd9 || marker === 0xda) break;
          const len = buf.readUInt16BE(i + 2);
          if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
            out = { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
            break;
          }
          i += 2 + len;
        }
      } else if (buf.length > 10 && (String.fromCharCode(...buf.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...buf.slice(0, 6)) === 'GIF89a')) {
        out = { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
      } else if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const type = buf.toString('ascii', 12, 16);
        if (type === 'VP8X') {
          out = { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
        }
      }
    } catch {
      out = null;
    }
    imageMetaCache.set(filePath, out);
    return out;
  }

  function inferAltFromSrc(src, fallback = 'Editorial image') {
    if (!src || typeof src !== 'string') return fallback;
    const base = path.basename(src).replace(path.extname(src), '').replace(/[-_]+/g, ' ').trim();
    return base ? `${base} image` : fallback;
  }

  function escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function imgTag(src, alt, className = '', extraAttrs = '') {
    const filePath = getAssetImageFilePath(src);
    const dims = readImageSize(filePath);
    const sizeAttrs = dims?.width && dims?.height ? ` width="${dims.width}" height="${dims.height}"` : '';
    const cls = className ? ` class="${className}"` : '';
    const attrs = extraAttrs ? ` ${extraAttrs.trim()}` : '';
    return `<img src="${src}" alt="${escapeAttr(alt || inferAltFromSrc(src))}"${cls}${sizeAttrs}${attrs}>`;
  }

  function optimizeContentImages(html, fallbackAltPrefix) {
    if (!html) return html;
    return html.replace(/<img\b[^>]*>/gi, (tag) => {
      const srcM = tag.match(/\ssrc="([^"]+)"/i);
      if (!srcM) return tag;
      const src = srcM[1];
      const altM = tag.match(/\salt="([^"]*)"/i);
      const widthM = tag.match(/\swidth="([^"]+)"/i);
      const heightM = tag.match(/\sheight="([^"]+)"/i);
      const loadingM = tag.match(/\sloading="([^"]+)"/i);
      const alt = (altM && altM[1].trim()) ? altM[1] : inferAltFromSrc(src, `${fallbackAltPrefix} image`);
      const filePath = getAssetImageFilePath(src);
      const dims = readImageSize(filePath);
      let out = tag;
      if (!altM) out = out.replace('<img', `<img alt="${escapeAttr(alt)}"`);
      else if (!altM[1].trim()) out = out.replace(altM[0], ` alt="${escapeAttr(alt)}"`);
      if (dims?.width && dims?.height && (!widthM || !heightM)) {
        if (!widthM) out = out.replace('<img', `<img width="${dims.width}"`);
        if (!heightM) out = out.replace('<img', `<img height="${dims.height}"`);
      }
      if (!loadingM) out = out.replace('<img', '<img loading="lazy"');
      return out;
    });
  }

  return {
    getAssetImageFilePath,
    readImageSize,
    inferAltFromSrc,
    escapeAttr,
    imgTag,
    optimizeContentImages
  };
}

module.exports = {
  makeImageHelpers
};
