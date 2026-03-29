'use strict';

function buildLocalizedLandingPages(ctx) {
  const { LANGS, buildLanding, buildRoadmap, buildFaq, sitemap } = ctx;
  for (const lang of LANGS) {
    buildLanding('index.yml', '/', 'index', lang, sitemap);
    buildLanding('ecosystem.yml', '/ecosystem', 'ecosystem', lang, sitemap);
    buildLanding('tools.yml', '/tools', 'tools', lang, sitemap);
    buildLanding('founders.yml', '/founders', 'founders', lang, sitemap);
    buildLanding('beta-services.yml', '/beta-services', 'beta_services', lang, sitemap);
    buildRoadmap(lang, sitemap);
    buildFaq(lang, sitemap);
  }
}

module.exports = {
  buildLocalizedLandingPages
};
