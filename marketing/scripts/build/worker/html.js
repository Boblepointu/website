function navHtml(pathname, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  const i18nNav = {
    ecosystem: workerI18nValue(safeLang, 'nav.ecosystem', 'Ecosystem'),
    tools: workerI18nValue(safeLang, 'nav.tools', 'Tools'),
    roadmap: workerI18nValue(safeLang, 'nav.roadmap', 'Roadmap'),
    faq: workerI18nValue(safeLang, 'nav.faq', 'FAQ'),
    docs: workerI18nValue(safeLang, 'nav.docs', 'Docs'),
    explorer: workerI18nValue(safeLang, 'nav.explorer', 'Explorer'),
    social: workerText(safeLang, 'social', 'Social'),
    more: workerI18nValue(safeLang, 'nav.more', 'More'),
    founders: workerI18nValue(safeLang, 'nav.founders', 'Founders'),
    beta: workerI18nValue(safeLang, 'nav.beta_services', 'Beta Services'),
    blog: workerI18nValue(safeLang, 'nav.blog', 'Blog'),
    language: workerI18nValue(safeLang, 'common.language', 'Language')
  };
  const localized = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const topNavClass = function(active) {
    return active
      ? 'text-sm/6 font-semibold flex items-center gap-1 text-primary underline underline-offset-4 decoration-primary'
      : 'text-sm/6 font-semibold flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:text-primary';
  };
  const moreButtonClass = function(active) {
    return active
      ? 'text-sm/6 font-semibold flex items-center gap-1 text-primary'
      : 'text-sm/6 font-semibold flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:text-primary';
  };
  const dropdownItemClass = function(active) {
    return active
      ? 'block px-3 py-2 text-sm text-primary font-semibold bg-gray-50 dark:bg-gray-800 rounded-lg'
      : 'block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg';
  };
  const mobileItemClass = function(active) {
    return active
      ? 'block px-3 py-2 text-sm font-semibold text-primary bg-gray-50 dark:bg-gray-800 rounded-lg'
      : 'block px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg';
  };
  const clean = stripWorkerLangPrefix(pathname || '/');
  const isEcosystem = clean === '/ecosystem';
  const isTools = clean === '/tools';
  const isRoadmap = clean === '/roadmap';
  const isFaq = clean === '/faq';
  const isDocs = clean === '/docs' || clean.startsWith('/docs/');
  const isFounders = clean === '/founders';
  const isBetaServices = clean === '/beta-services';
  const isBlog = clean === '/blog' || clean.startsWith('/blog/');
  const isExplorer = clean === '/explorer' || clean.startsWith('/explorer/');
  const isSocial = clean === '/social' || clean.startsWith('/social/');
  const isMore = isFounders || isBetaServices || isBlog;
  const flagByLang = { en: '🇬🇧', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', de: '🇩🇪', ru: '🇷🇺', cn: '🇨🇳' };
  const langOptions = WORKER_LANGS.map(function(code) {
    const label = workerI18nValue(code, 'lang_name', code.toUpperCase());
    const href = withWorkerLangPrefix(code, clean);
    const active = code === safeLang;
    const cls = active
      ? 'block px-3 py-2 text-sm text-primary font-semibold rounded-lg whitespace-nowrap'
      : 'block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg whitespace-nowrap';
    return '<a href="' + href + '" lang="' + workerI18nValue(code, 'html_lang', code) + '" class="' + cls + '">' + (flagByLang[code] || '🌐') + ' ' + label + ' (' + code.toUpperCase() + ')</a>';
  }).join('');
  return '<header class="bg-background/75 backdrop-blur border-b border-gray-200 dark:border-gray-800 -mb-px sticky top-0 z-50">' +
    '<nav class="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl flex items-center justify-between gap-3 h-[--header-height]">' +
    '<div class="lg:flex-1 flex items-center gap-1.5"><a href="' + localized('/') + '" aria-label="Lotusia home" class="flex-shrink-0 font-bold text-xl text-gray-900 dark:text-white flex items-end gap-1.5"><img src="/assets/images/logo.png" alt="Lotusia" class="h-8 w-auto" width="340" height="96"></a></div>' +
    '<div class="items-center gap-x-8 hidden lg:flex">' +
    '<a href="' + localized('/ecosystem') + '" class="' + topNavClass(isEcosystem) + '">' + esc(i18nNav.ecosystem) + '</a>' +
    '<a href="' + localized('/tools') + '" class="' + topNavClass(isTools) + '">' + esc(i18nNav.tools) + '</a>' +
    '<a href="' + localized('/roadmap') + '" class="' + topNavClass(isRoadmap) + '">' + esc(i18nNav.roadmap) + '</a>' +
    '<a href="' + localized('/faq') + '" class="' + topNavClass(isFaq) + '">' + esc(i18nNav.faq) + '</a>' +
    '<a href="/docs" class="' + topNavClass(isDocs) + '">' + esc(i18nNav.docs) + '</a>' +
    '<a href="' + localized('/explorer/blocks') + '" class="' + topNavClass(isExplorer) + '">' + esc(i18nNav.explorer) + '</a>' +
    '<a href="' + localized('/social/activity') + '" class="' + topNavClass(isSocial) + '">' + esc(i18nNav.social) + '</a>' +
    '<div class="relative" data-dropdown>' +
    '<button type="button" class="' + moreButtonClass(isMore) + '" data-dropdown-trigger aria-expanded="false">' + esc(i18nNav.more) + ' <span class="text-xs">▾</span></button>' +
    '<div class="hidden absolute top-full right-0 mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg p-2 z-50" data-dropdown-menu>' +
    '<a href="' + localized('/founders') + '" class="' + dropdownItemClass(isFounders) + '">' + esc(i18nNav.founders) + '</a>' +
    '<a href="' + localized('/beta-services') + '" class="' + dropdownItemClass(isBetaServices) + '">' + esc(i18nNav.beta) + '</a>' +
    '<a href="/blog" class="' + dropdownItemClass(isBlog) + '">' + esc(i18nNav.blog) + '</a>' +
    '<a href="https://explorer.lotusia.org" target="_blank" rel="noopener noreferrer" class="' + dropdownItemClass(false) + '">Legacy Explorer</a>' +
    '<a href="https://legacy.lotusia.org/social/activity" target="_blank" rel="noopener noreferrer" class="' + dropdownItemClass(false) + '">Legacy Social</a>' +
    '</div></div></div>' +
    '<div class="flex items-center justify-end lg:flex-1 gap-1.5">' +
    '<div class="relative hidden lg:block" data-dropdown>' +
    '<button type="button" class="text-sm/6 font-semibold flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:text-primary whitespace-nowrap" data-dropdown-trigger aria-expanded="false">' + esc(i18nNav.language) + ': ' + (flagByLang[safeLang] || '🌐') + ' ' + safeLang.toUpperCase() + ' <span class="text-xs">▾</span></button>' +
    '<div class="hidden absolute top-full right-0 mt-1 w-60 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg p-2 z-50" data-dropdown-menu>' + langOptions + '</div></div>' +
    '<a href="https://t.me/givelotus" target="_blank" rel="noopener noreferrer" class="hidden sm:inline-flex items-center justify-center rounded-full p-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800" aria-label="Telegram" title="Telegram">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>' +
    '</a>' +
    '<a href="https://github.com/LotusiaStewardship" target="_blank" rel="noopener noreferrer" class="hidden sm:inline-flex items-center justify-center rounded-full p-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800" aria-label="GitHub" title="GitHub">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>' +
    '</a>' +
    '<button onclick="var d=document.documentElement;d.classList.toggle(\'dark\');localStorage.setItem(\'theme\',d.classList.contains(\'dark\')?\'dark\':\'light\')" class="hidden sm:inline-flex relative flex-shrink-0 border-2 border-transparent h-4 w-7 rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="Toggle dark mode">' +
    '<span class="pointer-events-none relative inline-block rounded-full bg-white dark:bg-gray-900 shadow h-3 w-3 transform transition-transform translate-x-0 dark:translate-x-3"></span>' +
    '</button>' +
    '</div>' +
    '<button class="lg:hidden inline-flex items-center justify-center rounded-full p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800" aria-label="Menu" aria-expanded="false" onclick="var n=document.getElementById(\'mobile-nav\');n.classList.toggle(\'hidden\');this.setAttribute(\'aria-expanded\',n.classList.contains(\'hidden\')?\'false\':\'true\')">' +
    '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>' +
    '</button></nav>' +
    '<div id="mobile-nav" class="hidden lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-1 max-h-[calc(100vh-var(--header-height))] overflow-y-auto overscroll-contain">' +
    '<a href="' + localized('/ecosystem') + '" class="' + mobileItemClass(isEcosystem) + '">' + esc(i18nNav.ecosystem) + '</a>' +
    '<a href="' + localized('/tools') + '" class="' + mobileItemClass(isTools) + '">' + esc(i18nNav.tools) + '</a>' +
    '<a href="' + localized('/roadmap') + '" class="' + mobileItemClass(isRoadmap) + '">' + esc(i18nNav.roadmap) + '</a>' +
    '<a href="' + localized('/faq') + '" class="' + mobileItemClass(isFaq) + '">' + esc(i18nNav.faq) + '</a>' +
    '<a href="/docs" class="' + mobileItemClass(isDocs) + '">' + esc(i18nNav.docs) + '</a>' +
    '<a href="' + localized('/explorer/blocks') + '" class="' + mobileItemClass(isExplorer) + '">' + esc(i18nNav.explorer) + '</a>' +
    '<a href="' + localized('/social/activity') + '" class="' + mobileItemClass(isSocial) + '">' + esc(i18nNav.social) + '</a>' +
    '<a href="' + localized('/founders') + '" class="' + mobileItemClass(isFounders) + '">' + esc(i18nNav.founders) + '</a>' +
    '<a href="' + localized('/beta-services') + '" class="' + mobileItemClass(isBetaServices) + '">' + esc(i18nNav.beta) + '</a>' +
    '<a href="/blog" class="' + mobileItemClass(isBlog) + '">' + esc(i18nNav.blog) + '</a>' +
    '<a href="https://explorer.lotusia.org" target="_blank" rel="noopener noreferrer" class="' + mobileItemClass(false) + '">Legacy Explorer</a>' +
    '<a href="https://legacy.lotusia.org/social/activity" target="_blank" rel="noopener noreferrer" class="' + mobileItemClass(false) + '">Legacy Social</a>' +
    '</div></header>' +
    '<script>(function(){const d=Array.from(document.querySelectorAll(\'[data-dropdown]\'));if(!d.length)return;const c=(e)=>{const m=e.querySelector(\'[data-dropdown-menu]\');const t=e.querySelector(\'[data-dropdown-trigger]\');if(!m||!t)return;m.classList.add(\'hidden\');t.setAttribute(\'aria-expanded\',\'false\');};const o=(e)=>{const m=e.querySelector(\'[data-dropdown-menu]\');const t=e.querySelector(\'[data-dropdown-trigger]\');if(!m||!t)return;m.classList.remove(\'hidden\');t.setAttribute(\'aria-expanded\',\'true\');};d.forEach((e)=>{const t=e.querySelector(\'[data-dropdown-trigger]\');let x=null;if(!t)return;const s=()=>{clearTimeout(x);x=setTimeout(()=>c(e),140);};const k=()=>{clearTimeout(x);};e.addEventListener(\'mouseenter\',()=>{k();o(e);});e.addEventListener(\'mouseleave\',s);e.addEventListener(\'focusin\',()=>{k();o(e);});e.addEventListener(\'focusout\',()=>{if(!e.contains(document.activeElement))s();});t.addEventListener(\'click\',(a)=>{a.preventDefault();k();const p=t.getAttribute(\'aria-expanded\')===\'true\';d.forEach((y)=>{if(y!==e)c(y);});if(p)c(e);else o(e);});});document.addEventListener(\'click\',(e)=>{d.forEach((x)=>{if(!x.contains(e.target))c(x);});});})();</script>';
}

function pageShell(pathname, title, description, bodyHtml, opts) {
  const options = opts || {};
  const lang = WORKER_LANGS.includes(options.lang) ? options.lang : detectWorkerLang(pathname);
  const currentLocale = workerI18nValue(lang, 'locale', 'en_US');
  const pathString = String(pathname || '/');
  const queryIndex = pathString.indexOf('?');
  const pathOnly = queryIndex >= 0 ? pathString.slice(0, queryIndex) : pathString;
  const querySuffix = queryIndex >= 0 ? pathString.slice(queryIndex) : '';
  const baseLocalizedPath = stripWorkerLangPrefix(pathOnly || '/');
  const hreflangTags = WORKER_LANGS.map(function(code) {
    const href = withWorkerLangPrefix(code, baseLocalizedPath) + querySuffix;
    const hreflang = workerI18nValue(code, 'hreflang', code);
    return '<link rel="alternate" hreflang="' + esc(hreflang) + '" href="https://lotusia.org' + esc(href) + '">';
  }).join('');
  const xDefaultHref = withWorkerLangPrefix('en', baseLocalizedPath) + querySuffix;
  const xDefaultTag = '<link rel="alternate" hreflang="x-default" href="https://lotusia.org' + esc(xDefaultHref) + '">';
  const ogLocaleAlternates = WORKER_LANGS
    .filter(function(code) { return code !== lang; })
    .map(function(code) {
      return '<meta property="og:locale:alternate" content="' + esc(workerI18nValue(code, 'locale', 'en_US')) + '">';
    }).join('');
  const cleanPathname = String(pathname || '/').split('?')[0] || '/';
  const baseCleanPath = stripWorkerLangPrefix(cleanPathname);
  const isExplorerOrSocial = baseCleanPath === '/explorer' || baseCleanPath.startsWith('/explorer/') || baseCleanPath === '/social' || baseCleanPath.startsWith('/social/');
  const shellContainerClass = isExplorerOrSocial
    ? 'mx-auto w-full px-3 sm:px-5 lg:px-8 2xl:px-12 max-w-[1800px] py-8 sm:py-10'
    : 'mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8 sm:py-10';
  const autoBreadcrumbs = function(path) {
    const clean = stripWorkerLangPrefix(String(path || '/').split('?')[0] || '/');
    const parts = clean.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (!parts.length) return [{ label: workerI18nValue(lang, 'common.home', 'Home'), href: withWorkerLangPrefix(lang, '/') }];
    const toLabel = function(part) {
      const decoded = decodeURIComponent(String(part || ''));
      return decoded
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
    };
    const items = [{ label: workerI18nValue(lang, 'common.home', 'Home'), href: withWorkerLangPrefix(lang, '/') }];
    let acc = '';
    parts.forEach(function(part) {
      acc += '/' + encodeURIComponent(decodeURIComponent(part));
      items.push({ label: toLabel(part), href: withWorkerLangPrefix(lang, acc) });
    });
    return items;
  };
  const breadcrumbsItems = Array.isArray(options.breadcrumbs) && options.breadcrumbs.length
    ? options.breadcrumbs
    : autoBreadcrumbs(cleanPathname);
  const breadcrumbs = '<nav aria-label="Breadcrumb" class="text-xs text-gray-500 dark:text-gray-400 mb-8 pb-4 border-b border-gray-200/70 dark:border-gray-800/70"><ol class="flex flex-wrap items-center gap-1.5">' +
    breadcrumbsItems.map(function(item, idx) {
      const isLast = idx === breadcrumbsItems.length - 1;
      const href = item && item.href ? String(item.href) : '#';
      const currentAttr = isLast ? ' aria-current="page"' : '';
      const anchorClass = isLast
        ? 'font-semibold text-gray-700 dark:text-gray-200 hover:text-primary'
        : 'hover:text-primary';
      return '<li class="inline-flex items-center">' +
        (idx > 0 ? '<span class="mx-1 text-gray-500 dark:text-gray-500"> / </span>' : '') +
        '<a href="' + esc(href) + '"' + currentAttr + ' class="' + anchorClass + '">' + esc(item.label || '') + '</a>' +
        '</li>';
    }).join('') + '</ol></nav>';
  const keywords = options.keywords ? '<meta name="keywords" content="' + esc(options.keywords) + '">' : '';
  const ogImage = options.ogImage ? '<meta property="og:image" content="' + esc(options.ogImage) + '"><meta name="twitter:image" content="' + esc(options.ogImage) + '">' : '';
  const jsonLd = options.jsonLd ? '<script type="application/ld+json">' + options.jsonLd + '</script>' : '';
  return '<!DOCTYPE html><html lang="' + esc(workerI18nValue(lang, 'html_lang', lang)) + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + esc(title) + ' | Lotusia</title>' +
    '<meta name="description" content="' + esc(description) + '">' +
    keywords +
    '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">' +
    '<meta name="author" content="Lotusia Stewardship">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(description) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:locale" content="' + esc(currentLocale) + '">' +
    ogLocaleAlternates +
    '<meta property="og:url" content="https://lotusia.org' + esc(pathname) + '">' +
    '<meta property="og:site_name" content="Lotusia">' +
    ogImage +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(description) + '">' +
    '<link rel="canonical" href="https://lotusia.org' + esc(pathname) + '">' +
    hreflangTags +
    xDefaultTag +
    '<link rel="icon" href="/assets/favicon.ico">' +
    '<link rel="stylesheet" href="/assets/css/main.css">' +
    jsonLd +
    '</head>' +
    '<body class="bg-background text-foreground min-h-screen">' +
    navHtml(cleanPathname, lang) +
    '<main class="min-h-[calc(100vh-var(--header-height))]"><div class="' + shellContainerClass + '">' +
    breadcrumbs +
    '<section>' +
    bodyHtml +
    '</section></div></main>' +
    '<footer class="relative"><div class="border-t border-gray-200 dark:border-gray-800"><div class="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8 lg:py-4 lg:flex lg:items-center lg:justify-between lg:gap-x-3"><div class="lg:flex-1 flex items-center justify-center lg:justify-end gap-x-1.5 lg:order-3"></div><div class="mt-3 lg:mt-0 lg:order-2 flex items-center justify-center"></div><div class="flex items-center justify-center lg:justify-start lg:flex-1 gap-x-1.5 mt-3 lg:mt-0 lg:order-1"><p class="text-gray-600 dark:text-gray-400 text-sm">Copyright &copy; Lotusia 2021-2026. All rights reserved.</p></div></div></div></footer>' +
    '<script>(function(){var K=\'lotusia-scroll-restore\';var q=function(v){return String(v||\'\').replace(/[^A-Za-z0-9_-]/g,\'\');};var hasPagerParam=function(href){return /[?&][A-Za-z0-9_]*page=/i.test(String(href||\'\'));};var save=function(groupEl){try{var y=window.scrollY||window.pageYOffset||0;var payload={from:location.pathname+location.search,y:y,ts:Date.now()};if(groupEl){var gid=q(groupEl.getAttribute(\'data-pagination-group\')||\'\');if(gid){var gtop=(groupEl.getBoundingClientRect().top||0)+y;payload.group=gid;payload.offset=y-gtop;}}sessionStorage.setItem(K,JSON.stringify(payload));}catch(_){}};document.addEventListener(\'click\',function(e){var a=e.target&&e.target.closest?e.target.closest(\'a[href]\'):null;if(!a)return;var href=a.getAttribute(\'href\')||\'\';if(!hasPagerParam(href))return;if(href.charAt(0)!==\'/\')return;save(a.closest(\'[data-pagination-group]\'));});document.addEventListener(\'change\',function(e){var el=e.target;if(!el||!el.matches||!el.matches(\'select[data-page-size-select]\'))return;save(el.closest(\'[data-pagination-group]\'));});try{if(\'scrollRestoration\' in history)history.scrollRestoration=\'manual\';var raw=sessionStorage.getItem(K);if(!raw)return;var s=JSON.parse(raw);if(!s||!Number.isFinite(s.y))return;if(Date.now()-Number(s.ts||0)>20000)return;var fromPath=String(s.from||\'\').split(\'?\')[0]||\'\';if(fromPath&&fromPath!==location.pathname)return;var targetY=Math.max(0,Number(s.y)||0);if(s.group){var g=document.querySelector(\'[data-pagination-group=\"\'+q(s.group)+\'\"]\');if(g){var gy=(g.getBoundingClientRect().top||0)+(window.scrollY||window.pageYOffset||0);targetY=Math.max(0,gy+Number(s.offset||0));}}var root=document.documentElement;var body=document.body;var lockInstant=function(on){if(!root)return;if(on){root.style.setProperty(\'scroll-behavior\',\'auto\',\'important\');if(body)body.style.setProperty(\'scroll-behavior\',\'auto\',\'important\');}else{root.style.removeProperty(\'scroll-behavior\');if(body)body.style.removeProperty(\'scroll-behavior\');}};lockInstant(true);var jump=function(){window.scrollTo(0,targetY);};jump();requestAnimationFrame(jump);window.addEventListener(\'DOMContentLoaded\',jump,{once:true});window.addEventListener(\'load\',function(){jump();sessionStorage.removeItem(K);setTimeout(function(){lockInstant(false);},0);},{once:true});}catch(_){}})();</script>' +
    '<script>(function(){if(window.__lotusiaAvatarBoot)return;var parseSources=function(img){if(Array.isArray(img.__avatarSources))return img.__avatarSources;var raw=img.getAttribute(\'data-avatar-sources\')||\'\';if(!raw){img.__avatarSources=[];return img.__avatarSources;}var out=[];var parts=raw.split(\',\');for(var i=0;i<parts.length;i++){try{var dec=decodeURIComponent(parts[i]||\'\');if(dec&&out.indexOf(dec)===-1)out.push(dec);}catch(_){}}img.__avatarSources=out;return out;};window.__lotusiaAvatarNext=function(img){if(!img)return;var list=parseSources(img);var step=Number(img.getAttribute(\'data-avatar-step\')||\'0\');if(!Number.isFinite(step)||step<0)step=0;var next=step+1;if(next<list.length){img.setAttribute(\'data-avatar-step\',String(next));img.src=list[next];return;}img.style.display=\'none\';};var boot=function(){var nodes=document.querySelectorAll(\'img[data-avatar-img]\');for(var i=0;i<nodes.length;i++){var img=nodes[i];var list=parseSources(img);if(!list.length)continue;if(!img.getAttribute(\'src\')){img.setAttribute(\'data-avatar-step\',\'0\');img.src=list[0];}}};if(document.readyState===\'loading\'){document.addEventListener(\'DOMContentLoaded\',boot,{once:true});}else{boot();}window.__lotusiaAvatarBoot=true;})();</script>' +
    '<script>(function(){var run=function(){var nodes=document.querySelectorAll(\'table th, table td, table td a\');for(var i=0;i<nodes.length;i++){var el=nodes[i];if(!el)continue;if(el.children&&el.children.length>0&&el.tagName!==\'A\')continue;if(el.scrollWidth<=el.clientWidth+1)continue;var txt=(el.textContent||\'\').trim();if(!txt)continue;el.title=txt;el.style.overflow=\'hidden\';el.style.textOverflow=\'ellipsis\';el.style.whiteSpace=\'nowrap\';if(el.tagName===\'A\'&&el.style.display!==\'inline-block\'){el.style.display=\'inline-block\';}}};if(document.readyState===\'loading\'){document.addEventListener(\'DOMContentLoaded\',run);}else{run();}})();</script>' +
    '<script>(function(){var t=localStorage.getItem(\'theme\');if(t===\'dark\'||(t===null&&window.matchMedia(\'(prefers-color-scheme:dark)\').matches)){document.documentElement.classList.add(\'dark\');}})();</script>' +
    '</body></html>';
}

function tableHeaderCue(tableKind, options) {
  const opts = options || {};
  if (opts.hideCue) return '';
  const lang = WORKER_LANGS.includes(opts.lang) ? opts.lang : 'en';
  const cueByKind = {
    profiles: { title: workerText(lang, 'profiles_feed', 'Profiles Feed'), subtitle: workerText(lang, 'profiles_feed_subtitle', 'Rank and vote-ratio leaderboard') },
    activity: { title: workerText(lang, 'vote_activity', 'Vote Activity'), subtitle: workerText(lang, 'vote_activity_table_subtitle', 'Recent cross-platform vote events') },
    blocks: { title: workerText(lang, 'chain_head', 'Chain Head'), subtitle: workerText(lang, 'chain_head_subtitle', 'Latest confirmed block snapshots') },
    blocktxs: { title: workerText(lang, 'block_transactions', 'Block Transactions'), subtitle: workerText(lang, 'block_transactions_subtitle', 'Transactions included in this block') },
    posts: { title: workerText(lang, 'profile_posts', 'Profile Posts'), subtitle: workerText(lang, 'profile_posts_subtitle', 'Recent ranked posts for this profile') },
    votes: { title: workerText(lang, 'profile_votes', 'Profile Votes'), subtitle: workerText(lang, 'profile_votes_subtitle', 'Recent votes tied to this profile') },
    peers: { title: workerText(lang, 'network_peers', 'Network Peers'), subtitle: workerText(lang, 'network_peers_subtitle', 'Connected nodes and sync status') },
    inputs: { title: workerText(lang, 'transaction_inputs', 'Transaction Inputs'), subtitle: workerText(lang, 'transaction_inputs_subtitle', 'Spend sources and amounts') },
    outputs: { title: workerText(lang, 'transaction_outputs', 'Transaction Outputs'), subtitle: workerText(lang, 'transaction_outputs_subtitle', 'Destinations and amounts') },
    'profile-rank': { title: workerText(lang, 'profile_rankings', 'Profile Rankings'), subtitle: workerText(lang, 'profile_rankings_subtitle', 'Rank snapshot by profile') },
    'post-rank': { title: workerText(lang, 'post_rankings', 'Post Rankings'), subtitle: workerText(lang, 'post_rankings_subtitle', 'Rank snapshot by post') },
    generic: { title: workerText(lang, 'dataset', 'Dataset'), subtitle: workerText(lang, 'dataset_subtitle', 'Structured records from worker APIs') }
  };
  const cue = cueByKind[tableKind] || cueByKind.generic;
  const title = opts.cueTitle || cue.title;
  const subtitle = opts.cueSubtitle || cue.subtitle;
  return '<div class="px-4 py-2.5 bg-gray-50/80 dark:bg-gray-900/70 border-b border-gray-200/80 dark:border-gray-800">' +
    '<div class="flex flex-wrap items-center justify-between gap-3">' +
    '<span class="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold text-gray-600 dark:text-gray-300">' +
    '<span class="h-1.5 w-1.5 rounded-full bg-primary-500"></span>' + esc(title) + '</span>' +
    '<span class="text-xs text-gray-500 dark:text-gray-400">' + esc(subtitle) + '</span>' +
    '</div></div>';
}

function renderTable(headers, rows, emptyMessage, options) {
  const opts = options || {};
  const key = headers.join('|');
  const tableKindByKey = {
    '#|Profile|Ranking|Vote Ratio': 'profiles',
    'Transaction ID|First Seen|Profile|Vote|Post ID': 'activity',
    'Height|Hash|Timestamp|Burned|Transactions|Size': 'blocks',
    'Transaction ID|First Seen|Burned|Inputs|Outputs|Size': 'blocktxs',
    'Post ID|Ranking|Vote Ratio': 'posts',
    'Transaction|Timestamp|Sentiment|Amount|Post ID': 'votes',
    'Country|Address|Version|Blocks': 'peers',
    'Profile|Ranking': 'profile-rank',
    'Post|Ranking': 'post-rank',
    'Input|Source|Amount': 'inputs',
    'Output|Destination|Amount': 'outputs'
  };
  const tableKind = String(opts.tableKind || tableKindByKey[key] || 'generic');
  const colgroupByTable = {
    '#|Profile|Ranking|Vote Ratio': ['8%', '42%', '24%', '26%'],
    'Transaction ID|First Seen|Profile|Vote|Post ID': ['18%', '21%', '25%', '14%', '22%'],
    'Height|Hash|Timestamp|Burned|Transactions|Size': ['11%', '33%', '18%', '13%', '13%', '12%'],
    'Transaction ID|First Seen|Burned|Inputs|Outputs|Size': ['30%', '20%', '14%', '12%', '12%', '12%'],
    'Post ID|Ranking|Vote Ratio': ['44%', '22%', '34%'],
    'Transaction|Timestamp|Sentiment|Amount|Post ID': ['26%', '22%', '16%', '14%', '22%'],
    'Country|Address|Version|Blocks': ['9%', '40%', '33%', '18%'],
    'Profile|Ranking': ['58%', '42%'],
    'Post|Ranking': ['72%', '28%'],
    'Input|Source|Amount': ['14%', '58%', '28%'],
    'Output|Destination|Amount': ['14%', '58%', '28%']
  };
  const defaultWidthByHeader = {
    '#': '8%',
    'Height': '12%',
    'Hash': '30%',
    'Timestamp': '18%',
    'Burned': '12%',
    'Transactions': '10%',
    'Size': '8%',
    'Transaction ID': '22%',
    'Transaction': '20%',
    'First Seen': '18%',
    'Profile': '24%',
    'Vote': '14%',
    'Post ID': '18%',
    'Ranking': '16%',
    'Vote Ratio': '14%',
    'Country': '10%',
    'Address': '36%',
    'Version': '22%',
    'Blocks': '12%',
    'Input': '14%',
    'Source': '42%',
    'Amount': '14%',
    'Output': '14%',
    'Destination': '42%',
    'Post': '56%',
    'Sentiment': '14%'
  };
  const colgroupByKind = {
    profiles: colgroupByTable['#|Profile|Ranking|Vote Ratio'],
    activity: colgroupByTable['Transaction ID|First Seen|Profile|Vote|Post ID'],
    blocks: colgroupByTable['Height|Hash|Timestamp|Burned|Transactions|Size'],
    blocktxs: colgroupByTable['Transaction ID|First Seen|Burned|Inputs|Outputs|Size'],
    posts: colgroupByTable['Post ID|Ranking|Vote Ratio'],
    votes: colgroupByTable['Transaction|Timestamp|Sentiment|Amount|Post ID'],
    peers: colgroupByTable['Country|Address|Version|Blocks'],
    'profile-rank': colgroupByTable['Profile|Ranking'],
    'post-rank': colgroupByTable['Post|Ranking'],
    inputs: colgroupByTable['Input|Source|Amount'],
    outputs: colgroupByTable['Output|Destination|Amount']
  };
  const predefined = colgroupByKind[tableKind] || colgroupByTable[key] || null;
  const known = headers.reduce(function(sum, h, idx) {
    const raw = predefined ? predefined[idx] : defaultWidthByHeader[h];
    return raw ? sum + Number(raw.replace('%', '')) : sum;
  }, 0);
  const unknownCount = headers.filter(function(h, idx) { return !(predefined ? predefined[idx] : defaultWidthByHeader[h]); }).length;
  const fallback = unknownCount > 0 ? Math.max(8, Math.floor((100 - known) / unknownCount)) + '%' : '10%';
  const colgroup = '<colgroup>' + headers.map(function(h, idx) {
    return '<col style="width:' + ((predefined && predefined[idx]) || defaultWidthByHeader[h] || fallback) + ';">';
  }).join('') + '</colgroup>';
  const head = headers.map(h => '<th data-ellipsis-auto class="text-left rtl:text-right px-4 py-3.5 text-gray-100 dark:text-white/95 font-semibold text-sm uppercase tracking-wide">' + esc(h) + '</th>').join('');
  const bodyRows = rows.length
    ? rows.map(function(row) {
      if (typeof row !== 'string') return row;
      if (row.includes('<tr class=')) return row;
      return row.replace('<tr>', '<tr class="hover:bg-gray-50/60 dark:hover:bg-gray-800/45 transition-colors">');
    }).join('')
    : '<tr><td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400" colspan="' + headers.length + '">' + esc(emptyMessage) + '</td></tr>';
  const shellClass = opts.withPagination
    ? 'rounded-t-2xl rounded-b-none border border-gray-200/90 dark:border-gray-700/70 bg-white dark:bg-gray-900 shadow-lg shadow-primary-950/10 dark:shadow-black/40 overflow-hidden'
    : 'rounded-2xl border border-gray-200/90 dark:border-gray-700/70 bg-white dark:bg-gray-900 shadow-lg shadow-primary-950/10 dark:shadow-black/40 overflow-hidden';
  return '<div class="' + shellClass + '">' +
    tableHeaderCue(tableKind, opts) +
    '<div class="relative overflow-x-auto table-responsive table-kind-' + tableKind + '">' +
    '<table class="min-w-full table-fixed divide-y divide-gray-300 dark:divide-gray-700">' +
    colgroup +
    '<thead class="bg-gray-900/30 dark:bg-gray-950/45"><tr>' + head + '</tr></thead>' +
    '<tbody class="divide-y divide-gray-200/90 dark:divide-gray-700/80">' + bodyRows + '</tbody></table></div></div>';
}

const ICON_SYMBOLS = {
  network: 'fa-network',
  connections: 'fa-connections',
  cube: 'fa-cube',
  clock: 'fa-clock',
  bolt: 'fa-bolt',
  gauge: 'fa-gauge',
  social: 'fa-social',
  chart: 'fa-chart',
  profile: 'fa-profile',
  coins: 'fa-coins',
  weight: 'fa-weight',
  txs: 'fa-txs',
  flame: 'fa-flame',
  x: 'fa-x',
  up: 'fa-up',
  down: 'fa-down',
  minus: 'fa-minus',
  external: 'fa-external',
  prev: 'fa-prev',
  next: 'fa-next'
};

function iconSvg(name, cls) {
  const symbol = ICON_SYMBOLS[name] || 'fa-fallback';
  return '<svg viewBox="0 0 512 512" class="' + cls + '" fill="currentColor" aria-hidden="true" focusable="false"><use href="/assets/icons/fa/sprite.svg#' + symbol + '"></use></svg>';
}

function avatarProxyUrl(platform, profileId) {
  if (String(platform || '').toLowerCase() === 'twitter') return '/_avatar/twitter/' + encodeURIComponent(String(profileId || ''));
  return '/_avatar/gravatar/' + encodeURIComponent(String(profileId || ''));
}

function sideNavSection(title, iconName, items) {
  const links = items.map(i => {
    const cls = i.active
      ? 'group relative min-w-0 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-primary-700 dark:text-primary-200 bg-primary-50 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700 shadow-sm'
      : 'group relative min-w-0 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';
    const dot = i.active
      ? '<span class="h-1.5 w-1.5 rounded-full bg-primary-500 shadow-[0_0_0_2px_rgba(139,92,246,0.2)]"></span>'
      : '<span class="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-400 dark:group-hover:bg-primary-500 transition-colors"></span>';
    return '<a href="' + i.href + '" class="' + cls + '">' + dot + '<span class="truncate">' + esc(i.label) + '</span></a>';
  }).join('');
  return '<div class="mb-4 lg:mb-7"><h3 class="px-1.5 mb-2 lg:mb-3.5 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-2.5">' +
    '<span class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-primary-500/10 to-sky-500/10 text-primary-500 dark:text-primary-300 ring-1 ring-primary-500/25">' + iconSvg(iconName, 'h-4 w-4') + '</span>' +
    '<span>' + esc(title) + '</span></h3><div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1 lg:block lg:space-y-2 lg:pb-2 border-b border-gray-200/70 dark:border-gray-800/70">' + links + '</div></div>';
}

function legacyExplorerLayout(activeKey, contentHtml, options) {
  const opts = options || {};
  const lang = WORKER_LANGS.includes(opts.lang) ? opts.lang : 'en';
  const localize = function(path) { return withWorkerLangPrefix(lang, path); };
  const network = sideNavSection(workerText(lang, 'network', 'Network'), 'network', [
    { label: workerText(lang, 'overview', 'Overview'), href: localize('/explorer'), active: activeKey === 'overview' },
    { label: workerText(lang, 'blocks', 'Blocks'), href: localize('/explorer/blocks'), active: activeKey === 'blocks' }
  ]);
  const social = sideNavSection(workerText(lang, 'social_media', 'Social Media'), 'social', [
    { label: workerText(lang, 'latest', 'Latest'), href: localize('/social/activity'), active: activeKey === 'latest' },
    { label: workerText(lang, 'trending', 'Trending'), href: localize('/social/trending'), active: activeKey === 'trending' },
    { label: workerText(lang, 'profiles', 'Profiles'), href: localize('/social/profiles'), active: activeKey === 'profiles' }
  ]);
  return '<div class="grid lg:grid-cols-[250px_1fr] gap-6 lg:gap-8">' +
    '<aside class="rounded-2xl border border-gray-200/90 dark:border-gray-700/70 bg-gray-50/80 dark:bg-gray-900/70 p-3 sm:p-4 lg:p-5 shadow-lg shadow-primary-950/10 dark:shadow-black/40 h-fit lg:sticky lg:top-[calc(var(--header-height)+2rem)]">' + network + social + '</aside>' +
    '<section>' + contentHtml + '</section>' +
    '</div>';
}