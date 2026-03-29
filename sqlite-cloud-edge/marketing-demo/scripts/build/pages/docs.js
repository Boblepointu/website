'use strict';

function buildDocsPages(ctx) {
  const { buildDocs, sitemap } = ctx;
  buildDocs(sitemap);
}

module.exports = {
  buildDocsPages
};
