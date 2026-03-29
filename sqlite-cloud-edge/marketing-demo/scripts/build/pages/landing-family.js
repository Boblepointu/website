'use strict';

const path = require('path');

function makeLandingBuilders(ctx) {
  const {
    CONTENT,
    I18N,
    SITE_URL,
    readYaml,
    langPath,
    localizedAlternates,
    navRoute,
    localHref,
    fileLastmod,
    setSitemapEntry,
    imgTag,
    abs,
    jsonLd,
    webSiteJsonLd,
    webPageJsonLd,
    breadcrumbJsonLd,
    makePageMeta,
    renderPage,
    writeOutFromPath
  } = ctx;

  const ORG = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Lotusia Stewardship',
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo.png` },
    foundingDate: '2021',
    sameAs: [
      'https://github.com/LotusiaStewardship',
      'https://t.me/givelotus',
      'https://guillioud.com',
      'https://lotusia.org'
    ]
  };

  function overlayI18nSections(yamlSections, i18nSections) {
    if (!i18nSections?.length || !yamlSections?.length) return yamlSections;
    return yamlSections.map((section, i) => {
      const t = i18nSections[i];
      if (!t) return section;
      const out = { ...section };
      if (t.title) out.title = t.title;
      if (t.description) out.description = t.description;
      if (t.headline) out.headline = t.headline;
      if (t.features && section.features) {
        out.features = section.features.map((f, fi) => {
          const ft = t.features?.[fi];
          return ft ? { ...f, name: ft.name || f.name, description: ft.description || f.description } : f;
        });
      }
      if (t.quotes && section.quotes) {
        out.quotes = section.quotes.map((q, qi) => {
          const qt = t.quotes?.[qi];
          return qt ? { ...q, text: qt.text || q.text } : q;
        });
      }
      return out;
    });
  }

  function overlayI18nFaqQuestions(yamlQuestions, i18nQuestions) {
    if (!i18nQuestions?.length || !yamlQuestions?.length) return yamlQuestions;
    return yamlQuestions.map((q, i) => {
      const t = i18nQuestions[i];
      if (!t) return q;
      return { ...q, text: t.text || q.text, answer: t.answer || q.answer };
    });
  }

  function overlayI18nRoadmapSections(yamlSections, i18nSections) {
    if (!i18nSections?.length || !yamlSections?.length) return yamlSections;
    return yamlSections.map((epoch, i) => {
      const te = i18nSections[i];
      if (!te) return epoch;
      const out = { ...epoch };
      if (te.title) out.title = te.title;
      if (te.headline) out.headline = te.headline;
      if (te.cards && epoch.cards) {
        out.cards = epoch.cards.map((card, ci) => {
          const tc = te.cards?.[ci];
          if (!tc) return card;
          const cardOut = { ...card };
          if (tc.title) cardOut.title = tc.title;
          if (tc.description) cardOut.description = tc.description;
          if (tc.checklist && card.checklist) {
            cardOut.checklist = card.checklist.map((item, li) => {
              const tl = tc.checklist?.[li];
              return tl ? { ...item, label: tl.label || item.label } : item;
            });
          }
          return cardOut;
        });
      }
      return out;
    });
  }

  function renderFeatures(features) {
    if (!features?.length) return '';
    return '<dl class="mt-6 leading-7 space-y-4">'
      + features.map(f => {
        const icon = f.icon
          ? `<span class="${f.icon} absolute left-0 top-1 h-5 w-5 text-primary" aria-hidden="true"></span>`
          : `<span class="absolute left-0 top-1 h-5 w-5 text-primary" aria-hidden="true">&#x2022;</span>`;
        return `<div class="relative pl-8"><dt class="font-semibold text-gray-900 dark:text-white">${icon}<span>${f.name}</span></dt><dd class="text-gray-500 dark:text-gray-400 leading-6">${f.description}</dd></div>`;
      }).join('')
      + '</dl>';
  }

  function renderQuotes(quotes) {
    if (!quotes?.length) return '';
    return quotes.map(q =>
      `<div class="rounded-xl bg-gray-100/50 dark:bg-gray-800/50 p-6 border border-gray-200/50 dark:border-gray-700/50 mb-4">`
      + `<p class="text-gray-600 dark:text-gray-300 italic mb-3 leading-7">"${q.text}"</p>`
      + `<div class="flex items-center gap-3">`
      + (q.avatar ? imgTag(`/assets/images/${path.basename(q.avatar)}`, `${q.author} avatar`, 'w-10 h-10 rounded-full object-cover') : '')
      + `<div><div class="font-semibold text-gray-900 dark:text-white text-sm">${q.author}</div><div class="text-xs text-gray-500 dark:text-gray-400">${q.title || ''}</div></div></div></div>`
    ).join('');
  }

  function translateLabel(i18n, label) {
    const map = {
      'Get Started': i18n.buttons.get_started,
      'Learn More': i18n.buttons.learn_more,
      'Technical Docs': i18n.buttons.technical_docs
    };
    return map[label] || label;
  }

  function buildKeywords(base, extras) {
    const items = [];
    const pushMany = function(values) {
      for (const value of values) {
        const token = String(value || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}+ ]+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!token || items.includes(token)) continue;
        items.push(token);
      }
    };
    pushMany(['lotusia', 'lotusia blockchain', 'xpi', 'lotusia stewardship']);
    pushMany(String(base || '').split(/[\s,|/-]+/));
    pushMany(extras || []);
    return items.slice(0, 18).join(', ');
  }

  function seoKeywords(i18n, key, fallback) {
    const value = i18n && i18n.seo && i18n.seo[key];
    return String(value || fallback || '');
  }

  function renderLinks(links, lang, opts = {}) {
    if (!links?.length) return '';
    const i18n = I18N[lang];
    const { defaultPrimary = false, singleRow = false } = opts;
    const promotedPrimaryLabels = new Set([
      'See the code',
      'Download software upgrade',
      "See what's new",
      'Technical Docs'
    ]);
    const impliedIconByLabel = {
      'See the code': 'i-heroicons-code-bracket-solid',
      'Download software upgrade': 'i-heroicons-arrow-top-right-on-square',
      "See what's new": 'i-heroicons-newspaper',
      'Technical Docs': 'i-heroicons-document-text-solid'
    };
    const wrapperClass = singleRow
      ? 'mt-10 flex flex-nowrap gap-3 overflow-x-auto pb-1'
      : 'mt-10 flex flex-wrap gap-x-6 gap-y-3';
    return `<div class="${wrapperClass}">`
      + links.map(l => {
        const translatedLabel = translateLabel(i18n, l.label);
        const promoted = promotedPrimaryLabels.has(String(l.label || '')) || promotedPrimaryLabels.has(String(translatedLabel || ''));
        const primary = promoted || l.color === 'purple' || l.color === 'primary' || (!l.color && defaultPrimary);
        const cls = primary
          ? 'inline-flex items-center rounded-full font-medium text-base gap-x-2.5 px-3.5 py-2.5 shadow-sm text-white bg-primary-500 hover:bg-primary-600 transition-colors'
          : 'inline-flex items-center rounded-full font-medium text-base gap-x-2.5 px-3.5 py-2.5 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';
        const clsWithRow = singleRow ? `${cls} flex-shrink-0 whitespace-nowrap` : cls;
        const tgt = l.target === '_blank' ? ' target="_blank"' : '';
        const href = localHref(lang, l.to || '#');
        const iconName = l.icon || impliedIconByLabel[String(l.label || '')] || impliedIconByLabel[String(translatedLabel || '')] || '';
        const icon = iconName ? `<span class="${iconName} h-5 w-5 flex-shrink-0" aria-hidden="true"></span>` : '';
        return `<a href="${href}" class="${clsWithRow}"${tgt}>${icon}<span>${translatedLabel}</span></a>`;
      }).join('')
      + '</div>';
  }

  function renderSections(sections, pageType, lang) {
    if (!sections?.length) return '';
    return sections.map((s, i) => {
      const quotes = renderQuotes(s.quotes);
      const features = renderFeatures(s.features);
      const links = renderLinks(s.links, lang, {
        defaultPrimary: pageType === 'tools',
        singleRow: pageType === 'tools'
      });
      let image = '';
      if (pageType === 'founders') {
        const img = i === 0 ? 'alexandre_guillioud.jpeg' : 'matthew_urgero.jpeg';
        image = imgTag(`/assets/images/${img}`, `${s.title} portrait`, 'w-full max-w-sm', 'loading="lazy" style="border-radius:15%;"');
      } else if (pageType === 'ecosystem') {
        const imgs = ['ecosystem_0_0.jpg', 'ecosystem_1_2.jpg', 'ecosystem_2_0.jpg', 'ecosystem_3_0.jpg'];
        if (!quotes && imgs[i]) image = imgTag(`/assets/images/${imgs[i]}`, `${s.title} illustration`, 'w-full max-w-sm', 'loading="lazy" style="border-radius:15%;"');
      } else if (pageType === 'tools') {
        const imgs = ['LotusQT_0.png', 'lotus-lib_1.jpeg', 'extension_1.jpeg', 'bigvase_1.jpeg'];
        if (imgs[i]) image = imgTag(`/assets/images/${imgs[i]}`, `${s.title} screenshot`, 'w-full max-w-sm', 'loading="lazy" style="border-radius:15%;"');
      } else if (!quotes) {
        image = imgTag(`/assets/images/turtles_${i + 1}.jpeg`, `${s.title} illustration`, 'w-full max-w-sm', 'loading="lazy" style="border-radius:15%;"');
      }

      const textOnRight = (s.align === 'right') || (s.align === undefined && i % 2 === 0);
      const textDiv = `<div${textOnRight ? ' class="lg:order-last"' : ''}>${s.headline ? `<p class="text-base/7 font-semibold text-primary">${s.headline}</p>` : ''}<h2 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">${s.title}</h2><p class="mt-6 text-lg/8 text-gray-600 dark:text-gray-300">${s.description}</p>${features}${links}</div>`;
      const mediaDiv = quotes ? `<div class="grid grid-cols-1 gap-8">${quotes}</div>` : (image ? `<div class="flex justify-center">${image}</div>` : '');
      return `<div class="py-16 sm:py-24"><div class="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl gap-16 sm:gap-y-24 grid lg:grid-cols-2 lg:items-center">${textDiv}${mediaDiv}</div></div>`;
    }).join('\n');
  }

  function renderTable(tableData) {
    if (!tableData?.columns || !tableData?.rows) return '';
    const headers = tableData.columns.map(c => `<th>${c.label || c.key}</th>`).join('');
    const rows = tableData.rows.map(r =>
      `<tr>${tableData.columns.map(c => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`
    ).join('');
    return `<table class="specs-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function breadcrumbHtml(parts) {
    return `<nav aria-label="Breadcrumb"><span class="inline-flex flex-wrap items-center">`
      + parts.map((p, i) => {
        const node = i < parts.length - 1
          ? `<a href="${p.url}" class="hover:text-primary">${p.name}</a>`
          : `<span class="text-gray-900 dark:text-white font-semibold">${p.name}</span>`;
        const sep = i > 0 ? `<span class="mx-1 text-gray-400">/&nbsp;</span>` : '';
        return `${sep}${node}`;
      }).join('')
      + `</span></nav>`;
  }

  function buildLanding(file, basePath, pageType, lang, sitemap) {
    const data = readYaml(file);
    const i18n = I18N[lang];
    const pi = i18n.pages[pageType] || {};
    const pagePath = langPath(lang, basePath);
    const alternates = localizedAlternates(basePath);
    const isHome = basePath === '/';

    const imgFile = data.ogImage || data.hero?.image;
    const ogImg = imgFile
      ? `/assets/images/${path.basename(typeof imgFile === 'string' ? imgFile : imgFile.light || 'turtles_hero.jpeg')}`
      : '/assets/images/turtles_hero.jpeg';
    const heroImg = data.hero?.image
      ? imgTag(`/assets/images/${path.basename(typeof data.hero.image === 'string' ? data.hero.image : data.hero.image.light || '')}`, `${data.hero?.title || data.title || 'Lotusia'} hero image`, 'w-full max-w-md', 'loading="lazy" style="border-radius:15%;"')
      : '';

    const pageTitle = pi.og_title || data.ogTitle || data.title || '';
    const title = pi.title || pageTitle;
    const seoKey = pageType === 'index' ? 'home_keywords' : `${pageType}_keywords`;
    const heroTitle = pi.hero_title || data.hero?.title || data.title || '';
    const heroDesc = pi.hero_description || pi.description || data.hero?.description || data.description || '';
    const description = pi.description || data.description || '';
    const sections = overlayI18nSections(data.sections, pi.sections);
    const bcParts = isHome ? [] : [{ name: i18n.common.home, url: navRoute(lang, '/') }, { name: title, url: pagePath }];
    const breadcrumbDiv = isHome ? '' : `<div class="pt-4 text-sm text-gray-500">${breadcrumbHtml(bcParts)}</div>`;
    const heroBlock = `<div class="md:py-40 relative py-16 sm:py-16 lg:py-16"><div class="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl gap-16 sm:gap-y-24 grid lg:grid-cols-2 lg:items-center"><div><h1 class="text-5xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-7xl">${heroTitle}</h1><p class="mt-6 text-lg tracking-tight text-gray-600 dark:text-gray-300">${heroDesc}</p>${renderLinks(data.hero?.links, lang, { singleRow: pageType === 'beta-services' })}</div><div class="flex justify-center">${heroImg}</div></div></div>`;

    const ldItems = [webPageJsonLd(title, description, pagePath, lang)];
    if (isHome) ldItems.unshift(webSiteJsonLd(lang), ORG);
    if (!isHome) ldItems.push(breadcrumbJsonLd(bcParts));
    if (pageType === 'founders' && sections) {
      sections.forEach((s, idx) => {
        ldItems.push({
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: s.title,
          jobTitle: s.headline || 'Founder',
          image: `${SITE_URL}/assets/images/${idx === 0 ? 'alexandre_guillioud.jpeg' : 'matthew_urgero.jpeg'}`
        });
      });
    }

    let ctaData = data.cta;
    if (ctaData && pi.cta) {
      ctaData = { ...ctaData, title: pi.cta.title || ctaData.title, description: pi.cta.description || ctaData.description };
    }
    const ctaHtml = ctaData
      ? `<div class="max-w-3xl mx-auto py-16 sm:py-24 text-center px-4"><h2 class="text-3xl font-bold tracking-tight sm:text-4xl">${ctaData.title}</h2><p class="mt-6 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">${ctaData.description}</p>${renderLinks(ctaData.links || data.hero?.links, lang)}</div>`
      : '';

    const vars = {
      ...makePageMeta(lang, pagePath, alternates),
      title,
      og_title: pageTitle,
      description,
      keywords: seoKeywords(i18n, seoKey, buildKeywords(`${title} ${description}`, [
        i18n.nav.ecosystem,
        i18n.nav.tools,
        i18n.nav.roadmap,
        i18n.nav.faq
      ])),
      og_image: ogImg,
      hero_block: heroBlock,
      sections: renderSections(sections, pageType, lang),
      cta: ctaHtml,
      breadcrumb_html: breadcrumbDiv,
      json_ld: jsonLd(...ldItems),
      head_extra: ''
    };
    writeOutFromPath(pagePath, renderPage('landing', vars));
    setSitemapEntry(sitemap, basePath, alternates, fileLastmod(path.join(CONTENT, file)));
  }

  function buildRoadmap(lang, sitemap) {
    const data = readYaml('roadmap.yml');
    const i18n = I18N[lang];
    const pi = i18n.pages.roadmap || {};
    const basePath = '/roadmap';
    const pagePath = langPath(lang, basePath);
    const alternates = localizedAlternates(basePath);
    const roadmapSections = overlayI18nRoadmapSections(data.sections, pi.sections);
    const sectionsHtml = (roadmapSections || []).map(epoch => {
      const headline = epoch.headline ? `<div class="mb-3 text-sm/6 font-semibold text-primary flex items-center">${epoch.headline}</div>` : '';
      const statusColors = {
        complete: 'bg-emerald-500/10 text-emerald-500 border-emerald-500',
        ongoing: 'bg-amber-500/10 text-amber-500 border-purple-500',
        planned: 'bg-primary-500/10 text-primary-500 border-primary-500'
      };
      const cards = (epoch.cards || []).map(card => {
        const borderColor = card.status === 'complete' ? 'border-l-emerald-500' : card.status === 'ongoing' ? 'border-l-purple-500' : 'border-l-primary-500';
        const badge = card.status ? `<span class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColors[card.status] || ''}">${card.status}</span>` : '';
        const checklist = (card.checklist || []).map(item => `<div class="${item.complete ? 'task task-done' : 'task'}">${item.label}</div>`).join('');
        return `<div class="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-4 ${borderColor} relative"><div class="flex-1 px-4 py-5 sm:p-6"><div class="mb-6 flex"><div class="flex items-center gap-2">${badge}</div></div><p class="text-gray-900 dark:text-white text-base font-semibold">${card.title}</p><p class="text-[15px] text-gray-500 dark:text-gray-400 mt-1">${card.description || ''}</p><div class="mt-2">${checklist}</div>${renderLinks(card.links, lang, { defaultPrimary: true })}</div></div>`;
      }).join('');
      return `<div class="flex flex-col lg:grid lg:grid-cols-10 lg:gap-8"><div class="lg:col-span-10"><div class="relative border-b border-gray-200 dark:border-gray-800 py-8">${headline}<div class="flex flex-col lg:flex-row items-start gap-6"><div class="flex-1"><h2 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">${epoch.title}</h2></div></div></div><div class="mt-8 pb-24"><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">${cards}</div></div></div></div>`;
    }).join('\n');

    const heroTitle = pi.hero_title || data.hero?.title || 'Roadmap';
    const heroDesc = pi.hero_description || pi.description || data.hero?.description || data.description || '';
    const title = pi.title || data.ogTitle || 'Roadmap';
    const description = pi.description || data.description || '';
    const bcParts = [{ name: i18n.common.home, url: navRoute(lang, '/') }, { name: title, url: pagePath }];
    const itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: title,
      itemListElement: (data.sections || []).flatMap((epoch, ei) =>
        (epoch.cards || []).map((card, ci) => ({ '@type': 'ListItem', position: ei * 100 + ci + 1, name: card.title, description: card.description || '' }))
      )
    };

    const vars = {
      ...makePageMeta(lang, pagePath, alternates),
      title,
      og_title: pi.og_title || data.ogTitle || 'Roadmap',
      description,
      keywords: seoKeywords(i18n, 'roadmap_keywords', buildKeywords(`${title} ${description}`, [
        i18n.nav.roadmap,
        i18n.pages.ecosystem && i18n.pages.ecosystem.title,
        i18n.pages.tools && i18n.pages.tools.title
      ])),
      og_image: '/assets/images/roadmap_0.jpg',
      hero_block: `<div class="py-8 sm:py-16 lg:py-24"><div class="flex flex-col gap-8 sm:gap-y-16"><div class="flex flex-col items-center text-center"><h1 class="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">${heroTitle}</h1><p class="mt-4 text-lg text-gray-500 dark:text-gray-400">${heroDesc}</p></div></div></div>`,
      sections: sectionsHtml,
      cta: '',
      breadcrumb_html: `<div class="pt-4 text-sm text-gray-500">${breadcrumbHtml(bcParts)}</div>`,
      json_ld: jsonLd(webPageJsonLd(title, description, pagePath, lang), breadcrumbJsonLd(bcParts), itemList),
      head_extra: ''
    };
    writeOutFromPath(pagePath, renderPage('landing', vars));
    setSitemapEntry(sitemap, basePath, alternates, fileLastmod(path.join(CONTENT, 'roadmap.yml')));
  }

  function buildFaq(lang, sitemap) {
    const data = readYaml('faq.yml');
    const i18n = I18N[lang];
    const pi = i18n.pages.faq || {};
    const basePath = '/faq';
    const pagePath = langPath(lang, basePath);
    const alternates = localizedAlternates(basePath);

    function renderFaqItems(questions) {
      if (!questions?.length) return '';
      return questions.map(q => {
        let extra = '';
        if (q.note) extra += `<div class="pb-2 flex flex-wrap gap-x-3 gap-y-1.5 items-center"><span class="text-gray-500 dark:text-gray-400 text-sm">${q.note}</span></div>`;
        if (q.links) extra += `<div class="lg:space-y-1.5">${q.links.map(l => `<a href="${localHref(lang, l.to)}" class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-primary text-sm"${l.target ? ` target="${l.target}"` : ''}>${translateLabel(i18n, l.label)}</a>`).join('')}</div>`;
        if (q.table) extra += renderTable(q.table);
        return `<div class="pb-16"><div class="text-xl font-semibold text-gray-900 dark:text-white">${q.text}</div><div class="py-2 flex flex-wrap gap-x-3 gap-y-1.5 text-gray-600 dark:text-gray-300">${q.answer}</div>${extra}</div>`;
      }).join('\n');
    }

    const translatedQuestions = overlayI18nFaqQuestions(data.questions, pi.questions);
    let sectionsHtml = '';
    if (translatedQuestions) sectionsHtml += `<div class="flex flex-col lg:grid lg:grid-cols-10 lg:gap-8"><div class="lg:col-span-10"><div class="mt-8 pb-24">${renderFaqItems(translatedQuestions)}</div></div></div>`;
    if (data.technical) {
      let techHtml = renderFaqItems(data.technical.questions);
      if (data.technical.sections) {
        techHtml += data.technical.sections.map(s => `<div class="pb-16"><h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">${s.title}</h3>${renderTable(s.table)}</div>`).join('\n');
      }
      sectionsHtml += `<div class="flex flex-col lg:grid lg:grid-cols-10 lg:gap-8"><div class="lg:col-span-10"><div class="mt-8 pb-24">${techHtml}</div></div></div>`;
    }
    if (data.cta) {
      const faqCta = pi.cta ? { ...data.cta, title: pi.cta.title || data.cta.title, description: pi.cta.description || data.cta.description } : data.cta;
      sectionsHtml += `<div class="py-16 sm:py-24 text-center"><h2 class="text-3xl font-bold tracking-tight sm:text-4xl text-gray-900 dark:text-white">${faqCta.title}</h2><p class="mt-4 text-lg text-gray-500 dark:text-gray-400">${faqCta.description}</p>${renderLinks(faqCta.links, lang)}</div>`;
    }

    const title = pi.title || data.ogTitle || 'FAQ';
    const heroTitle = pi.hero_title || data.hero?.title || 'FAQ';
    const heroDesc = pi.hero_description || pi.description || data.hero?.description || data.description || '';
    const description = pi.description || data.description || '';
    const bcParts = [{ name: i18n.common.home, url: navRoute(lang, '/') }, { name: title, url: pagePath }];
    const faqMainEntity = (translatedQuestions || []).map(q => ({ '@type': 'Question', name: q.text, acceptedAnswer: { '@type': 'Answer', text: q.answer } }));

    const vars = {
      ...makePageMeta(lang, pagePath, alternates),
      title,
      og_title: pi.og_title || data.ogTitle || 'FAQ',
      description,
      keywords: seoKeywords(i18n, 'faq_keywords', buildKeywords(`${title} ${description}`, [
        i18n.nav.faq,
        i18n.pages.docs && i18n.pages.docs.title,
        i18n.pages.ecosystem && i18n.pages.ecosystem.title
      ])),
      og_image: '/assets/images/turtles_hero.jpeg',
      hero_block: `<div class="py-8 sm:py-16 lg:py-24"><div class="flex flex-col gap-8 sm:gap-y-16"><div class="flex flex-col items-center text-center"><h1 class="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">${heroTitle}</h1><p class="mt-4 text-lg text-gray-500 dark:text-gray-400">${heroDesc}</p><div class="mt-8 flex flex-wrap gap-x-3 gap-y-1.5 justify-center">${renderLinks(data.links, lang)}</div></div></div></div>`,
      sections: sectionsHtml,
      cta: '',
      breadcrumb_html: `<div class="pt-4 text-sm text-gray-500">${breadcrumbHtml(bcParts)}</div>`,
      json_ld: jsonLd(webPageJsonLd(title, description, pagePath, lang), breadcrumbJsonLd(bcParts), { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqMainEntity }),
      head_extra: ''
    };
    writeOutFromPath(pagePath, renderPage('landing', vars));
    setSitemapEntry(sitemap, basePath, alternates, fileLastmod(path.join(CONTENT, 'faq.yml')));
  }

  return {
    buildLanding,
    buildRoadmap,
    buildFaq,
    breadcrumbHtml
  };
}

module.exports = {
  makeLandingBuilders
};
