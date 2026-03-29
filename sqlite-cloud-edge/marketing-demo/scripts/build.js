'use strict';
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  DIST,
  TEMPLATES,
  CONTENT,
  ASSETS,
  I18N_DIR,
  IMAGES_DIR,
  SOCIAL_DIR,
  SITE_URL,
  LANGS,
  LOCALIZED_ROUTES
} = require('./build/config');
const {
  readTemplate: readTemplateFile,
  readYaml: readYamlFile,
  loadI18n
} = require('./build/io/content');
const { makeImageHelpers } = require('./build/io/images');
const { renderPage: renderTemplatePage } = require('./build/io/templates');
const { makeNavMetaHelpers } = require('./build/i18n/nav-meta');
const {
  maxLastmod: maxLastmodUtil,
  setSitemapEntry: setSitemapEntryUtil,
  localizedAlternates: buildLocalizedAlternates,
  buildSitemap: buildSitemapXml
} = require('./build/seo/sitemap');
const { makeSeoHelpers } = require('./build/seo/meta');
const {
  writeRobots,
  writeRedirects,
  writeWorkerSafelist
} = require('./build/dist/artifacts');
const { buildLocalizedLandingPages } = require('./build/pages/landing');
const { buildBlogPages } = require('./build/pages/blog');
const { buildDocsPages } = require('./build/pages/docs');
const { makeLandingBuilders } = require('./build/pages/landing-family');
const { makeBlogDocsBuilders } = require('./build/pages/content');
const { buildLocalFontAwesomeSprite } = require('./build/icons/fontawesome');
const { writeWorker, getWorkerSource } = require('./build/worker');

// ── Load every template once ────────────────────────────────────────────────
const headerTmpl = fs.readFileSync(path.join(TEMPLATES, 'partials/header.html'), 'utf8');
const footerTmpl = fs.readFileSync(path.join(TEMPLATES, 'partials/footer.html'), 'utf8');

function readTemplate(name) {
  return readTemplateFile(TEMPLATES, name);
}
function readYaml(file) {
  return readYamlFile(CONTENT, file);
}

const I18N = Object.fromEntries(LANGS.map(l => [l, loadI18n(I18N_DIR, l)]));
const navMetaHelpers = makeNavMetaHelpers({ SITE_URL, I18N, LANGS, LOCALIZED_ROUTES });
const imageHelpers = makeImageHelpers({ IMAGES_DIR });
const seoHelpers = makeSeoHelpers({ SITE_URL, I18N, LANGS, abs: (p) => navMetaHelpers.abs(p) });

// ── Token replacement ────────────────────────────────────────────────────────
function fill(tmpl, vars) {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars))
    out = out.split(`{{${k}}}`).join(String(v ?? ''));
  return out;
}

function renderPage(templateName, vars) {
  return renderTemplatePage(TEMPLATES, templateName, vars);
}

// ── Output ───────────────────────────────────────────────────────────────────
function writeOutFromPath(pagePath, html) {
  const rel = pagePath === '/' ? '' : pagePath.replace(/^\/+|\/+$/g, '');
  const dir = path.join(DIST, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`  ${pagePath}`);
}

// ── URL helpers ──────────────────────────────────────────────────────────────
function abs(p)       { return navMetaHelpers.abs(p); }
function langPath(lang, basePath) {
  return navMetaHelpers.langPath(lang, basePath);
}
function navRoute(lang, route) {
  return navMetaHelpers.navRoute(lang, route);
}
function localHref(lang, href) {
  return navMetaHelpers.localHref(lang, href);
}

function formatDateYMD(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : '';
}

function fileLastmod(filePath) {
  try {
    return formatDateYMD(fs.statSync(filePath).mtime);
  } catch {
    return '';
  }
}

function maxLastmod(a, b) {
  return maxLastmodUtil(a, b);
}

function setSitemapEntry(sitemap, canonicalPath, alternates, lastmod = '') {
  return setSitemapEntryUtil(sitemap, canonicalPath, alternates, lastmod);
}

function localizedAlternates(basePath) {
  return buildLocalizedAlternates(LANGS, langPath, basePath);
}

function getAssetImageFilePath(src) {
  return imageHelpers.getAssetImageFilePath(src);
}

function readImageSize(filePath) {
  return imageHelpers.readImageSize(filePath);
}

function inferAltFromSrc(src, fallback = 'Editorial image') {
  return imageHelpers.inferAltFromSrc(src, fallback);
}

function escapeAttr(value) {
  return imageHelpers.escapeAttr(value);
}

function imgTag(src, alt, className = '', extraAttrs = '') {
  return imageHelpers.imgTag(src, alt, className, extraAttrs);
}

function optimizeContentImages(html, fallbackAltPrefix) {
  return imageHelpers.optimizeContentImages(html, fallbackAltPrefix);
}

// ── JSON-LD helpers ───────────────────────────────────────────────────────────
function jsonLd(...items) {
  return seoHelpers.jsonLd(...items);
}

function webSiteJsonLd(lang) {
  return seoHelpers.webSiteJsonLd(lang);
}

function webPageJsonLd(title, description, pagePath, lang, type = 'WebPage') {
  return seoHelpers.webPageJsonLd(title, description, pagePath, lang, type);
}

function breadcrumbJsonLd(parts) {
  return seoHelpers.breadcrumbJsonLd(parts);
}

// ── hreflang tags ────────────────────────────────────────────────────────────
function hreflangTags(alternates) {
  return navMetaHelpers.hreflangTags(alternates);
}

// ── Language switcher ────────────────────────────────────────────────────────
function langSwitcher(currentLang, alternates, mobile = false) {
  return navMetaHelpers.langSwitcher(currentLang, alternates, mobile);
}

// ── Nav vars (injected into every header/footer render) ───────────────────────
function makeNavVars(lang, alternates, pagePath) {
  return navMetaHelpers.makeNavVars(lang, alternates, pagePath);
}

function makePageMeta(lang, pagePath, alternates) {
  return navMetaHelpers.makePageMeta(lang, pagePath, alternates);
}

function buildSocialPages(sitemap) {
  const activityPath = '/social/activity';
  const trendingPath = '/social/trending';
  const profilesPath = '/social/profiles';
  const lastmod = fileLastmod(path.join(SOCIAL_DIR, 'social-data.json')) || formatDateYMD(new Date());
  setSitemapEntry(sitemap, activityPath, localizedAlternates(activityPath), lastmod);
  setSitemapEntry(sitemap, trendingPath, localizedAlternates(trendingPath), lastmod);
  setSitemapEntry(sitemap, profilesPath, localizedAlternates(profilesPath), lastmod);
}

function buildExplorerPages(sitemap) {
  const overviewPath = '/explorer';
  const blocksPath = '/explorer/blocks';
  const mempoolPath = '/explorer/mempool';
  const statsPath = '/explorer/stats';
  const richlistPath = '/explorer/richlist';
  const networkPath = '/explorer/network';
  const lastmod = fileLastmod(path.join(SOCIAL_DIR, 'social-data.json')) || formatDateYMD(new Date());
  setSitemapEntry(sitemap, overviewPath, localizedAlternates(overviewPath), lastmod);
  setSitemapEntry(sitemap, blocksPath, localizedAlternates(blocksPath), lastmod);
  setSitemapEntry(sitemap, mempoolPath, localizedAlternates(mempoolPath), lastmod);
  setSitemapEntry(sitemap, statsPath, localizedAlternates(statsPath), lastmod);
  setSitemapEntry(sitemap, richlistPath, localizedAlternates(richlistPath), lastmod);
  setSitemapEntry(sitemap, networkPath, localizedAlternates(networkPath), lastmod);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
buildLocalFontAwesomeSprite(ROOT);

console.log('Building pages...');
const sitemap = new Map();
const { buildLanding, buildRoadmap, buildFaq, breadcrumbHtml } = makeLandingBuilders({
  CONTENT,
  I18N,
  SITE_URL,
  readYaml,
  langPath,
  localizedAlternates,
  navRoute,
  localHref,
  fileLastmod,
  setSitemapEntry,
  imgTag,
  abs,
  jsonLd,
  webSiteJsonLd,
  webPageJsonLd,
  breadcrumbJsonLd,
  makePageMeta,
  renderPage,
  writeOutFromPath
});
const { buildBlog, buildDocs } = makeBlogDocsBuilders({
  CONTENT,
  I18N,
  SITE_URL,
  LANGS,
  abs,
  optimizeContentImages,
  imgTag,
  makePageMeta,
  jsonLd,
  breadcrumbJsonLd,
  breadcrumbHtml,
  renderPage,
  writeOutFromPath,
  fileLastmod,
  setSitemapEntry,
  maxLastmod
});

buildLocalizedLandingPages({
  LANGS,
  buildLanding,
  buildRoadmap,
  buildFaq,
  sitemap
});
buildBlogPages({ buildBlog, sitemap });
buildDocsPages({ buildDocs, sitemap });
buildSocialPages(sitemap);
buildExplorerPages(sitemap);

// Copy assets
fs.cpSync(ASSETS, path.join(DIST, 'assets'), { recursive: true });

writeRobots(DIST, SITE_URL);
writeRedirects(DIST, []);

const workerSafelist = `
<div class="hidden">
  text-left rtl:text-right px-4 py-3.5 text-gray-900 dark:text-white font-semibold text-sm
  whitespace-nowrap px-4 py-4 text-gray-500 dark:text-gray-400
  min-w-full table-fixed divide-y divide-gray-300 dark:divide-gray-700
  rounded-md rounded-lg rounded-xl rounded-2xl border-l-2 border-primary-500
  ring-1 ring-inset ring-gray-300 dark:ring-gray-700
  bg-primary-500 hover:bg-primary-600 text-white dark:bg-primary-400 dark:text-gray-900
  bg-green-50 text-green-600 dark:bg-green-400/10 dark:text-green-400
  bg-lime-50 text-lime-600 dark:bg-lime-400/10 dark:text-lime-400
  bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400
  text-sky-500 dark:text-sky-400 text-primary-500 dark:text-primary-400
  hover:text-primary-600 dark:hover:text-primary-300
  sticky top-[calc(var(--header-height)+2rem)] tabular-nums
  grid lg:grid-cols-[250px_1fr] gap-6 lg:gap-8 xl:grid-cols-3 sm:grid-cols-2 sm:grid-cols-3
  lg:grid-cols-3 md:grid-cols-2 w-full object-cover break-all
  h-14 w-14 text-4xl font-extrabold shadow-sm overflow-hidden
  h-8 w-8 min-w-8 inline-flex relative items-center justify-center rounded-full
  h-4 w-4
  ml-2
  text-xs font-bold flex-shrink-0 object-cover
  p-3 sm:p-4 lg:p-5 p-6 mb-10 mb-8 mt-8 text-base leading-relaxed
  flex-wrap gap-1 gap-4 items-center justify-between
  inline-flex items-center gap-2 text-base leading-none
  shadow-lg shadow-primary-950/10 dark:shadow-black/40 bg-gray-50/80 dark:bg-gray-900/70
  border-gray-200/90 dark:border-gray-700/70 backdrop-blur-sm
  h-11 w-11 h-12 w-12 min-w-[2.75rem] rounded-xl rounded-2xl
  w-28 overflow-visible
  -mt-px rounded-b-2xl border-t-0 bg-gray-50/70 dark:bg-gray-900/60 py-3
  rounded-t-2xl rounded-b-none mt-0
  w-[4.4rem] min-w-max
  text-xs uppercase tracking-wide text-[11px] ring-primary-500/20
  text-gray-600 dark:text-gray-300
  h-1.5 w-1.5 bg-primary-500
  bg-gradient-to-r from-primary-500/10 to-sky-500/10
  text-primary-700 dark:text-primary-200 bg-primary-50 dark:bg-primary-900/30
  border-primary-300 dark:border-primary-700 hover:bg-gray-50/60 dark:hover:bg-gray-800/45
  border-b border-gray-200/70 dark:border-gray-800/70 transition-colors
  pointer-events-none absolute inset-y-0 right-2
  hover:bg-gray-50 dark:hover:bg-gray-800 ring-2 ring-primary-500/25
  shadow-[0_0_0_2px_rgba(139,92,246,0.2)]
  leading-6 transition-opacity duration-200 opacity-0 absolute inset-0
  gap-2.5 px-3.5 py-2.5 p-5
  shrink-0 break-all break-words leading-tight text-lg md:text-xl
  truncate max-w-full block
  border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded-md
  text-[11px] font-semibold uppercase tracking-wide text-green-400
  dark:text-green-300
  text-gray-100 dark:text-white/95 bg-gray-900/30 dark:bg-gray-950/45
  divide-gray-200/90 dark:divide-gray-700/80
  mb-4 lg:mb-7 mb-3.5 space-y-2 lg:space-y-2
  overflow-x-auto pb-1 lg:pb-2 lg:block whitespace-nowrap
  flex-shrink-0 whitespace-nowrap
  hidden sm:inline-flex
  w-full justify-between left-0 p-1.5
  overflow-x-hidden overflow-y-visible sm:overflow-x-auto
  max-h-[calc(100vh-var(--header-height))] overflow-y-auto overscroll-contain
  min-w-0 truncate grid-cols-1 sm:grid-cols-2
  overflow-hidden sm:overflow-x-auto
  flex-col items-stretch sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:min-w-max sm:whitespace-nowrap
  flex-wrap sm:gap-3
  px-3 sm:px-5 2xl:px-12 max-w-[1800px]
  bg-gray-100/90 dark:bg-gray-800/85 ring-1 ring-gray-200/70 dark:ring-gray-700/70
  bg-primary-500/10 dark:bg-primary-500/15 text-primary-500 dark:text-primary-300 ring-primary-500/25
  auto-rows-fr flex-1 ring-white/10
  bg-primary-600 text-white ring-2 ring-primary-300/40
  text-red-400 dark:text-red-300
  bg-background text-foreground min-h-screen
</div>
`.trim();
writeWorkerSafelist(DIST, workerSafelist);

// _worker.js (Cloudflare Pages advanced mode) for host-preserving proxy routes
writeWorker(DIST, getWorkerSource());

// sitemap.xml
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  buildSitemapXml(SITE_URL, sitemap, lang => (I18N[lang] && I18N[lang].hreflang) || lang)
);

console.log(`\nDone. ${sitemap.size} canonical URLs × up to ${LANGS.length} languages.`);
