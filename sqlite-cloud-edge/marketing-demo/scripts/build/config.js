'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const TEMPLATES = path.join(ROOT, 'templates');
const CONTENT = path.join(ROOT, 'content');
const ASSETS = path.join(ROOT, 'assets');
const I18N_DIR = path.join(ROOT, 'i18n');
const IMAGES_DIR = path.join(ASSETS, 'images');
const SOCIAL_DIR = path.join(CONTENT, 'social');

const SITE_URL = process.env.SITE_URL || 'https://lotusia.org';
const LANGS = ['en', 'fr', 'es', 'it', 'de', 'ru', 'cn'];
const LOCALIZED_ROUTES = new Set(['/', '/ecosystem', '/tools', '/roadmap', '/faq', '/founders', '/beta-services']);

module.exports = {
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
};
