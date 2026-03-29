'use strict';

function makeSeoHelpers({ SITE_URL, I18N, LANGS, abs }) {
  function jsonLd(...items) {
    return items.filter(Boolean).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  }

  function webSiteJsonLd(lang) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Lotusia',
      url: SITE_URL,
      description: I18N[lang].pages.index.description,
      inLanguage: I18N[lang].hreflang,
      availableLanguage: LANGS.map(c => I18N[c].hreflang),
      publisher: { '@type': 'Organization', name: 'Lotusia Stewardship', url: SITE_URL },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/docs?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    };
  }

  function webPageJsonLd(title, description, pagePath, lang, type = 'WebPage') {
    return {
      '@context': 'https://schema.org',
      '@type': type,
      name: title,
      description,
      url: abs(pagePath),
      isPartOf: { '@type': 'WebSite', name: 'Lotusia', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'Lotusia Stewardship', url: SITE_URL },
      inLanguage: I18N[lang].hreflang
    };
  }

  function breadcrumbJsonLd(parts) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: parts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, item: abs(p.url) }))
    };
  }

  return {
    jsonLd,
    webSiteJsonLd,
    webPageJsonLd,
    breadcrumbJsonLd
  };
}

module.exports = {
  makeSeoHelpers
};
