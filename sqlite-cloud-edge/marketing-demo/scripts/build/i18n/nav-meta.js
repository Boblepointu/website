'use strict';

function makeNavMetaHelpers({ SITE_URL, I18N, LANGS, LOCALIZED_ROUTES }) {
  function abs(p) {
    const raw = String(p || '/');
    try {
      const url = new URL(raw, SITE_URL);
      url.pathname = encodeURI(decodeURI(url.pathname));
      return url.toString();
    } catch (_) {
      return `${SITE_URL}${encodeURI(raw)}`;
    }
  }

  function langPath(lang, basePath) {
    if (lang === 'en') return basePath;
    return basePath === '/' ? `/${lang}` : `/${lang}${basePath}`;
  }

  function navRoute(lang, route) {
    if (lang === 'en' || !LOCALIZED_ROUTES.has(route)) return route;
    return langPath(lang, route);
  }

  function localHref(lang, href) {
    if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
    return navRoute(lang, href);
  }

  function hreflangTags(alternates) {
    const unique = new Set();
    const entries = Object.entries(alternates || {})
      .filter(([lang, href]) => LANGS.includes(lang) && href)
      .filter(([, href]) => {
        if (unique.has(href)) return false;
        unique.add(href);
        return true;
      });
    const lines = entries.map(([lang, href]) => {
      const hreflang = I18N[lang].hreflang || lang;
      return `<link rel="alternate" hreflang="${hreflang}" href="${abs(href)}">`;
    });
    const xDefault = alternates?.en || entries[0]?.[1];
    if (xDefault) lines.push(`<link rel="alternate" hreflang="x-default" href="${abs(xDefault)}">`);
    return lines.join('\n');
  }

  function langSwitcher(currentLang, alternates, mobile = false) {
    const cur = I18N[currentLang];
    const flagByLang = { en: '🇬🇧', fr: '🇫🇷', es: '🇪🇸', it: '🇮🇹', de: '🇩🇪', ru: '🇷🇺', cn: '🇨🇳' };
    const items = LANGS.map(lang => {
      const href = alternates[lang] || alternates.en;
      const flag = flagByLang[lang] || '🌐';
      const label = `${flag} ${I18N[lang].lang_name} (${lang.toUpperCase()})`;
      const active = lang === currentLang;
      if (mobile) {
        const cls = active
          ? 'block px-3 py-2 text-sm font-semibold text-primary rounded-lg whitespace-nowrap'
          : 'block px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg whitespace-nowrap';
        return `<a href="${href}" lang="${I18N[lang].html_lang}" class="${cls}">${label}</a>`;
      }
      const cls = active
        ? 'block px-3 py-2 text-sm text-primary font-semibold rounded-lg whitespace-nowrap'
        : 'block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg whitespace-nowrap';
      return `<a href="${href}" lang="${I18N[lang].html_lang}" class="${cls}">${label}</a>`;
    }).join('');

    if (mobile) return `<div class="border-t border-gray-200 dark:border-gray-800 mt-2 pt-2">${items}</div>`;
    const langLabel = cur.common.language;
    const currentFlag = flagByLang[currentLang] || '🌐';
    return `<div class="relative" data-dropdown><button type="button" class="text-sm/6 font-semibold flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:text-primary whitespace-nowrap" data-dropdown-trigger aria-expanded="false">${langLabel}: ${currentFlag} ${currentLang.toUpperCase()} <span class="text-xs">▾</span></button><div class="hidden absolute top-full right-0 mt-1 w-60 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg p-2 z-50" data-dropdown-menu>${items}</div></div>`;
  }

  function makeNavVars(lang, alternates, pagePath) {
    const i = I18N[lang];
    const normalized = (() => {
      const p = pagePath || '/';
      const withoutPrefix = p.replace(/^\/(fr|es|it|de|ru|cn)(?=\/|$)/, '');
      return withoutPrefix || '/';
    })();
    const isEcosystem = normalized === '/ecosystem';
    const isTools = normalized === '/tools';
    const isRoadmap = normalized === '/roadmap';
    const isFaq = normalized === '/faq';
    const isDocs = normalized === '/docs' || normalized.startsWith('/docs/');
    const isFounders = normalized === '/founders';
    const isBetaServices = normalized === '/beta-services';
    const isBlog = normalized === '/blog' || normalized.startsWith('/blog/');
    const isExplorer = normalized === '/explorer' || normalized.startsWith('/explorer/');
    const isSocial = normalized === '/social' || normalized.startsWith('/social/');
    const isMore = isFounders || isBetaServices || isBlog;

    const topNavClass = (active) => active
      ? 'text-sm/6 font-semibold flex items-center gap-1 text-primary underline underline-offset-4 decoration-primary'
      : 'text-sm/6 font-semibold flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:text-primary';
    const moreButtonClass = (active) => active
      ? 'text-sm/6 font-semibold flex items-center gap-1 text-primary'
      : 'text-sm/6 font-semibold flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:text-primary';
    const dropdownItemClass = (active) => active
      ? 'block px-3 py-2 text-sm text-primary font-semibold bg-gray-50 dark:bg-gray-800 rounded-lg'
      : 'block px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg';
    const mobileItemClass = (active) => active
      ? 'block px-3 py-2 text-sm font-semibold text-primary bg-gray-50 dark:bg-gray-800 rounded-lg'
      : 'block px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg';

    return {
      nav_ecosystem: i.nav.ecosystem,
      nav_tools: i.nav.tools,
      nav_roadmap: i.nav.roadmap,
      nav_faq: i.nav.faq,
      nav_docs: i.nav.docs,
      nav_founders: i.nav.founders,
      nav_blog: i.nav.blog,
      nav_more: i.nav.more,
      nav_explorer: i.nav.explorer,
      nav_beta_services: i.nav.beta_services,
      nav_cls_ecosystem: topNavClass(isEcosystem),
      nav_cls_tools: topNavClass(isTools),
      nav_cls_roadmap: topNavClass(isRoadmap),
      nav_cls_faq: topNavClass(isFaq),
      nav_cls_docs: topNavClass(isDocs),
      nav_cls_explorer_top: topNavClass(isExplorer),
      nav_cls_social_top: topNavClass(isSocial),
      nav_cls_more: moreButtonClass(isMore),
      nav_cls_founders: dropdownItemClass(isFounders),
      nav_cls_beta_services: dropdownItemClass(isBetaServices),
      nav_cls_blog: dropdownItemClass(isBlog),
      nav_cls_legacy_explorer: dropdownItemClass(false),
      nav_cls_legacy_social: dropdownItemClass(false),
      nav_m_cls_ecosystem: mobileItemClass(isEcosystem),
      nav_m_cls_tools: mobileItemClass(isTools),
      nav_m_cls_roadmap: mobileItemClass(isRoadmap),
      nav_m_cls_faq: mobileItemClass(isFaq),
      nav_m_cls_docs: mobileItemClass(isDocs),
      nav_m_cls_explorer_top: mobileItemClass(isExplorer),
      nav_m_cls_social_top: mobileItemClass(isSocial),
      nav_m_cls_founders: mobileItemClass(isFounders),
      nav_m_cls_beta_services: mobileItemClass(isBetaServices),
      nav_m_cls_blog: mobileItemClass(isBlog),
      nav_m_cls_legacy_explorer: mobileItemClass(false),
      nav_m_cls_legacy_social: mobileItemClass(false),
      toggle_theme: i.common.toggle_theme,
      footer_copyright: i.common.copyright,
      footer_all_rights_reserved: i.common.all_rights_reserved,
      url_home: navRoute(lang, '/'),
      url_ecosystem: navRoute(lang, '/ecosystem'),
      url_tools: navRoute(lang, '/tools'),
      url_roadmap: navRoute(lang, '/roadmap'),
      url_faq: navRoute(lang, '/faq'),
      url_docs: '/docs',
      url_founders: navRoute(lang, '/founders'),
      url_beta_services: navRoute(lang, '/beta-services'),
      url_blog: '/blog',
      url_explorer: '/explorer/blocks',
      url_social: '/social/activity',
      url_legacy_explorer: 'https://explorer.lotusia.org',
      url_legacy_social: 'https://legacy.lotusia.org/social/activity',
      breadcrumb_home: i.common.home,
      breadcrumb_blog: i.nav.blog,
      lang_switcher: langSwitcher(lang, alternates, false),
      lang_switcher_mobile: langSwitcher(lang, alternates, true)
    };
  }

  function makePageMeta(lang, pagePath, alternates) {
    const i = I18N[lang];
    return {
      html_lang: i.html_lang || lang,
      og_locale: i.locale || 'en_US',
      site_url: SITE_URL,
      canonical_url: abs(pagePath),
      hreflang_tags: hreflangTags(alternates),
      path: pagePath,
      ...makeNavVars(lang, alternates, pagePath)
    };
  }

  return {
    abs,
    langPath,
    navRoute,
    localHref,
    hreflangTags,
    langSwitcher,
    makeNavVars,
    makePageMeta
  };
}

module.exports = {
  makeNavMetaHelpers
};
