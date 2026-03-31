'use strict';

function makeSeoHelpers({ SITE_URL, I18N, LANGS, abs }) {
  const ORG = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: 'Lotusia Stewardship',
    alternateName: 'Lotusia',
    url: SITE_URL,
    foundingDate: '2021',
    description: 'Decentralized reputation protocol powered by burn-weighted sentiment on the Lotus blockchain',
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo.png` },
    sameAs: ['https://github.com/LotusiaStewardship', 'https://t.me/givelotus', 'https://guillioud.com']
  };

  function jsonLd(...items) {
    return items.filter(Boolean).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  }

  function webSiteJsonLd(lang) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Lotusia',
      url: SITE_URL,
      description: I18N[lang].pages.index.description,
      inLanguage: I18N[lang].hreflang,
      availableLanguage: LANGS.map(c => I18N[c].hreflang),
      publisher: { '@id': `${SITE_URL}/#organization` },
      about: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/docs?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      },
      mainEntity: ORG
    };
  }

  function webPageJsonLd(title, description, pagePath, lang, type = 'WebPage') {
    return {
      '@context': 'https://schema.org',
      '@type': type,
      '@id': `${abs(pagePath)}#webpage`,
      name: title,
      description,
      url: abs(pagePath),
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#organization` },
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: I18N[lang].hreflang,
      mainEntityOfPage: abs(pagePath)
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
