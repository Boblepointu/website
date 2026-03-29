'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function readTemplate(templatesDir, name) {
  return fs.readFileSync(path.join(templatesDir, `${name}.html`), 'utf8');
}

function readYaml(contentDir, file) {
  return yaml.load(fs.readFileSync(path.join(contentDir, file), 'utf8'));
}

function loadI18n(i18nDir, lang) {
  return JSON.parse(fs.readFileSync(path.join(i18nDir, `${lang}.json`), 'utf8'));
}

module.exports = {
  readTemplate,
  readYaml,
  loadI18n
};
