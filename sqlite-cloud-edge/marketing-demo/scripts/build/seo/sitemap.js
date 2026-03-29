'use strict';

function maxLastmod(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return a > b ? a : b;
}

function setSitemapEntry(sitemap, canonicalPath, alternates, lastmod = '') {
  const current = sitemap.get(canonicalPath);
  if (!current) {
    sitemap.set(canonicalPath, { alternates, lastmod: lastmod || '' });
    return;
  }
  const mergedAlternates = { ...current.alternates, ...alternates };
  sitemap.set(canonicalPath, {
    alternates: mergedAlternates,
    lastmod: maxLastmod(current.lastmod, lastmod)
  });
}

function localizedAlternates(langs, langPath, basePath) {
  return Object.fromEntries(langs.map(c => [c, langPath(c, basePath)]));
}

function buildSitemap(siteUrl, sitemap, resolveHrefLang) {
  const urls = Array.from(sitemap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([canonicalPath, data]) => {
      const loc = `${siteUrl}${canonicalPath}`;
      const links = Object.entries(data.alternates)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([lang, hrefPath]) => {
          const hreflang = typeof resolveHrefLang === 'function' ? (resolveHrefLang(lang) || lang) : lang;
          return `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${siteUrl}${hrefPath}"/>`;
        })
        .join('\n');
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}${data.alternates.en || canonicalPath}"/>`;
      const lastmodXml = data.lastmod ? `\n    <lastmod>${data.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${loc}</loc>\n${links}\n${xDefault}${lastmodXml}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

module.exports = {
  maxLastmod,
  setSitemapEntry,
  localizedAlternates,
  buildSitemap
};
