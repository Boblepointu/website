'use strict';

function buildBlogPages(ctx) {
  const { buildBlog, sitemap } = ctx;
  buildBlog(sitemap);
}

module.exports = {
  buildBlogPages
};
