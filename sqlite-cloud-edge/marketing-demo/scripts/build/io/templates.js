'use strict';

const fs = require('fs');
const path = require('path');
const { readTemplate } = require('./content');

function fill(tmpl, vars) {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(String(v ?? ''));
  return out;
}

function renderPage(templatesDir, templateName, vars) {
  const pageTmpl = readTemplate(templatesDir, templateName);
  const headerTmpl = fs.readFileSync(path.join(templatesDir, 'partials/header.html'), 'utf8');
  const footerTmpl = fs.readFileSync(path.join(templatesDir, 'partials/footer.html'), 'utf8');
  const header = fill(headerTmpl, vars);
  const footer = fill(footerTmpl, vars);
  return fill(pageTmpl, { ...vars, header, footer });
}

module.exports = {
  fill,
  renderPage
};
