'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');

function makeBlogDocsBuilders(ctx) {
  const {
    CONTENT,
    I18N,
    SITE_URL,
    LANGS,
    abs,
    optimizeContentImages,
    imgTag,
    makePageMeta,
    jsonLd,
    breadcrumbJsonLd,
    breadcrumbHtml,
    renderPage,
    writeOutFromPath,
    fileLastmod,
    setSitemapEntry,
    maxLastmod
  } = ctx;

  function parseFrontmatter(content) {
    const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return { meta: {}, body: content };
    return { meta: yaml.load(m[1]) || {}, body: m[2] };
  }

  function stripMarkdown(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#>*_~\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function clampText(text, minLen, maxLen, fallback) {
    const base = String(text || '').replace(/\s+/g, ' ').trim();
    const backup = String(fallback || '').replace(/\s+/g, ' ').trim();
    let out = base || backup;
    if (!out) return '';
    if (out.length < minLen && backup && out !== backup) out = `${out} ${backup}`.replace(/\s+/g, ' ').trim();
    if (out.length < minLen) out = `${out} Learn more on the official Lotusia website.`.replace(/\s+/g, ' ').trim();
    if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…';
    return out;
  }

  function buildMetaTitle(rawTitle, maxLen) {
    const text = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Lotusia';
    if (text.length > maxLen) return text.slice(0, maxLen - 1).trimEnd() + '…';
    if (text.length < 25) {
      const expanded = `${text} - Lotusia Documentation`;
      return expanded.length <= maxLen ? expanded : text;
    }
    return text;
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

  const DATE_LOCALES = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', de: 'de-DE', ru: 'ru-RU', cn: 'zh-CN' };

  function langBlogPath(lang, basePath) {
    return lang === 'en' ? basePath : `/${lang}${basePath}`;
  }

  function buildBlog(sitemap) {
    const blogDir = path.join(CONTENT, 'blog');
    const enFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.md') && !f.startsWith('.')).sort().reverse();

    const postSlugs = enFiles.map(f => f.replace(/^\d+\./, '').replace('.md', ''));
    const postFileMap = {};
    for (const file of enFiles) {
      const slug = file.replace(/^\d+\./, '').replace('.md', '');
      postFileMap[slug] = file;
    }

    const postAlternates = {};
    for (const slug of postSlugs) {
      const alts = { en: `/blog/${slug}` };
      for (const lang of LANGS) {
        if (lang === 'en') continue;
        const langDir = path.join(blogDir, lang);
        const enFile = postFileMap[slug];
        if (enFile && fs.existsSync(path.join(langDir, enFile))) {
          alts[lang] = `/${lang}/blog/${slug}`;
        }
      }
      postAlternates[slug] = alts;
    }

    const blogIndexAlternates = { en: '/blog' };
    for (const lang of LANGS) {
      if (lang === 'en') continue;
      const langDir = path.join(blogDir, lang);
      if (fs.existsSync(langDir) && fs.readdirSync(langDir).some(f => f.endsWith('.md'))) {
        blogIndexAlternates[lang] = `/${lang}/blog`;
      }
    }

    for (const lang of LANGS) {
      const i = I18N[lang];
      const iSeo = i.seo || {};
      const dateLocale = DATE_LOCALES[lang] || 'en-US';
      const isEn = lang === 'en';
      const langDir = isEn ? blogDir : path.join(blogDir, lang);
      const posts = [];
      let blogIndexLastmod = '';

      for (const file of enFiles) {
        const slug = file.replace(/^\d+\./, '').replace('.md', '');
        const filePath = isEn ? path.join(blogDir, file) : path.join(langDir, file);
        if (!fs.existsSync(filePath)) continue;

        const raw = fs.readFileSync(filePath, 'utf8');
        const { meta, body } = parseFrontmatter(raw);
        if (meta.draft === true) continue;
        if (meta.publishDate) {
          const pub = new Date(meta.publishDate);
          if (!isNaN(pub.getTime()) && pub > new Date()) continue;
        }
        const htmlBody = optimizeContentImages(marked(body).replace(/src="\/img\//g, 'src="/assets/images/'), meta.title || slug);
        const plainBody = stripMarkdown(body);
        const dateRaw = meta.date || '';
        const dateObj = dateRaw ? new Date(dateRaw) : null;
        const dateStr = dateObj ? dateObj.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
        const dateIso = dateObj ? dateObj.toISOString().split('T')[0] : '';
        const ogImage = meta.image && meta.image.src ? `/assets/images/blog/${path.basename(meta.image.src)}` : '/assets/images/blog_0.jpg';
        const authorName = (meta.authors && meta.authors[0] && meta.authors[0].name) || meta.author || 'Lotusia Stewardship';
        const heroImage = ogImage !== '/assets/images/blog_0.jpg'
          ? imgTag(ogImage, `${meta.title || slug} hero image`, 'blog-hero-img', 'loading="lazy"')
          : '';
        const canonicalPath = langBlogPath(lang, `/blog/${slug}`);
        const alts = postAlternates[slug] || { en: `/blog/${slug}` };
        const wordCount = (body || '').split(/\s+/).filter(Boolean).length;
        const articleSection = (meta.badge && meta.badge.label) || 'Blog';
        const fallbackDescription = `Read this Lotusia blog update about ${meta.title || slug} and stay current with ecosystem progress and releases.`;
        const metaDescription = clampText(meta.description || '', 90, 160, fallbackDescription || plainBody);
        const metaTitle = buildMetaTitle(meta.title || slug, 52);

        const vars = {
          ...makePageMeta(lang, canonicalPath, alts),
          title: meta.title || slug,
          meta_title: metaTitle,
          description: metaDescription,
          keywords: String(iSeo.blog_keywords || buildKeywords(meta.title || slug, ['blog', 'updates', 'ecosystem', 'release notes', 'technical article'])),
          slug,
          og_image: ogImage,
          date: dateStr,
          date_iso: dateIso,
          author: authorName,
          body: heroImage + htmlBody,
          json_ld: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: meta.title || slug,
            description: metaDescription,
            url: abs(canonicalPath),
            image: abs(ogImage),
            datePublished: dateIso || undefined,
            dateModified: dateIso || undefined,
            wordCount,
            articleSection,
            author: { '@type': 'Person', name: authorName },
            publisher: { '@type': 'Organization', name: 'Lotusia Stewardship', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo.png` } },
            inLanguage: i.html_lang || lang
          }),
          head_extra: ''
        };
        writeOutFromPath(canonicalPath, renderPage('blog-post', vars));

        const authorAvatar = meta.authors && meta.authors[0] && meta.authors[0].avatar && meta.authors[0].avatar.src
          ? `/assets/images/${path.basename(meta.authors[0].avatar.src)}`
          : '';
        const badge = (meta.badge && meta.badge.label) || '';
        const cardDate = dateObj ? dateObj.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        posts.push({ title: meta.title || slug, description: metaDescription, slug, date: cardDate, image: ogImage, author: authorName, avatar: authorAvatar, badge, canonicalPath, langBlogSlug: langBlogPath(lang, `/blog/${slug}`) });
        const postLastmod = dateIso || fileLastmod(filePath);
        setSitemapEntry(sitemap, canonicalPath, alts, postLastmod);
        blogIndexLastmod = maxLastmod(blogIndexLastmod, postLastmod);
      }

      if (posts.length === 0 && !isEn) continue;

      const postsHtml = posts.map((p, idx) => {
        const isFirst = idx === 0;
        const avatarHtml = p.avatar
          ? `<div class="inline-flex flex-row-reverse justify-end"><span class="inline-flex items-center justify-center flex-shrink-0 rounded-full h-6 w-6 text-xs ring-2 ring-white dark:ring-gray-900 overflow-hidden">${imgTag(p.avatar, `${p.author} avatar`, 'h-full w-full object-cover')}</span></div>`
          : '';
        const badgeHtml = p.badge
          ? `<div class="mb-3"><span class="inline-flex items-center font-medium rounded-md text-xs px-2 py-1 bg-primary-500/10 text-primary-500">${p.badge}</span></div>`
          : '';
        const imgWrapCls = isFirst ? 'relative overflow-hidden w-full rounded-lg lg:col-span-2' : 'relative overflow-hidden w-full rounded-lg';
        const imgHtml = p.image
          ? `<div class="${imgWrapCls}">${imgTag(p.image, `${p.title} cover image`, `w-full ${isFirst ? 'h-auto' : 'h-48'} object-cover`, 'loading="lazy"')}</div>`
          : '';
        const wrapperCls = isFirst ? 'relative flex flex-col w-full gap-y-6 lg:col-span-3 lg:grid lg:grid-cols-5 lg:gap-8' : 'relative flex flex-col w-full gap-y-6';
        const textWrapCls = isFirst ? 'flex flex-col justify-between flex-1 lg:col-span-3' : 'flex flex-col justify-between flex-1';
        return `<article class="${wrapperCls}">${imgHtml}<div class="${textWrapCls}"><div class="flex-1"><a href="${p.langBlogSlug}" class="absolute inset-0"><span class="sr-only">${p.title}</span></a>${badgeHtml}<h2 class="text-gray-900 dark:text-white text-xl font-semibold">${p.title}</h2><p class="text-base text-gray-600 dark:text-gray-300 mt-1">${p.description}</p></div><div class="relative flex items-center gap-x-3 mt-4">${avatarHtml}<time class="text-sm text-gray-600 font-medium">${p.date}</time></div></div></article>`;
      }).join('\n');

      const blogPath = langBlogPath(lang, '/blog');
      const vars = {
        ...makePageMeta(lang, blogPath, blogIndexAlternates),
        title: i.pages.blog.title,
        meta_title: (i.pages.blog.og_title || i.pages.blog.title || 'Blog') + ' - Lotusia',
        og_title: i.pages.blog.og_title,
        description: clampText(i.pages.blog.description, 90, 160, 'Latest Lotusia ecosystem updates, releases, and technical insights from the Stewardship team.'),
        keywords: String(iSeo.blog_keywords || buildKeywords('lotusia blog updates', ['blockchain news', 'ecosystem updates', 'product releases', 'protocol notes'])),
        og_image: '/assets/images/blog_0.jpg',
        hero_title: i.pages.blog.title,
        hero_description: i.pages.blog.description,
        blog_posts: postsHtml,
        json_ld: jsonLd({
          '@context': 'https://schema.org', '@type': 'CollectionPage',
          name: i.pages.blog.title || 'Blog', url: abs(blogPath), inLanguage: i.html_lang || lang,
          isPartOf: { '@type': 'WebSite', name: 'Lotusia', url: SITE_URL },
          hasPart: posts.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: abs(p.canonicalPath) }))
        }),
        head_extra: ''
      };
      writeOutFromPath(blogPath, renderPage('blog-index', vars));
      setSitemapEntry(sitemap, blogPath, blogIndexAlternates, blogIndexLastmod);
    }
  }

  function buildDocs(sitemap) {
    const enSeo = (I18N.en && I18N.en.seo) || {};
    const docsRoot = path.join(CONTENT, 'docs');
    const allDocs = [];
    const groups = {};

    function cleanName(n) { return n.replace(/^\d+\./, ''); }
    function walkDir(dir, urlPrefix, group) {
      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (e.isDirectory()) {
          const dirName = cleanName(e.name);
          const newGroup = group ? `${group} / ${dirName}` : dirName;
          walkDir(path.join(dir, e.name), `${urlPrefix}/${dirName}`, newGroup);
        } else if (e.name.endsWith('.md')) {
          const raw = fs.readFileSync(path.join(dir, e.name), 'utf8');
          const { meta, body } = parseFrontmatter(raw);
          const isIdx = e.name === 'index.md' || e.name === '0.index.md';
          const slug = isIdx ? urlPrefix : `${urlPrefix}/${cleanName(e.name).replace('.md', '')}`;
          const docPath = slug.startsWith('/docs') ? slug : `/docs${slug}`;
          const title = meta.title || cleanName(e.name).replace('.md', '').replace(/-/g, ' ');
          const gname = group || 'General';
          if (!groups[gname]) groups[gname] = [];
          groups[gname].push({ title, path: docPath });
          const rendered = optimizeContentImages(marked(body)
            .replace(/src="\/img\//g, 'src="/assets/images/')
            .replace(/src="\.\.\/img\//g, 'src="/assets/images/')
            .replace(/src="\/(preview[^"]*\.png)"/g, 'src="/assets/images/$1"'), title);
          const normalizedBody = rendered
            .replace(/<h1(\b[^>]*)>/gi, '<h2$1>')
            .replace(/<\/h1>/gi, '</h2>');
          allDocs.push({
            title,
            path: docPath,
            body: normalizedBody,
            rawBody: body,
            description: meta.description || '',
            group: gname,
            lastmod: fileLastmod(path.join(dir, e.name))
          });
        }
      }
    }
    walkDir(docsRoot, '/docs', '');

    function buildSidebar(currentPath) {
      const activeClass = 'block px-3 py-1 text-sm font-medium text-primary border-l border-primary';
      const inactiveClass = 'block px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg';
      const introClass = currentPath === '/docs'
        ? 'block px-3 py-1.5 text-sm font-semibold text-primary mb-3'
        : 'block px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-3 hover:text-primary';
      let sb = `<a href="/docs" class="${introClass}">Introduction</a>\n`;
      const guidesDocs = groups.guides;
      const orderedGroups = [];
      if (guidesDocs) orderedGroups.push(['Guides', guidesDocs]);
      for (const [g, docs] of Object.entries(groups)) {
        if (g === 'General' || g === 'guides') continue;
        orderedGroups.push([g, docs]);
      }
      for (const [groupLabel, docs] of orderedGroups) {
        const isOpen = docs.some(d => currentPath === d.path || currentPath.startsWith(`${d.path}/`));
        sb += `<details class="mb-2 border-t border-gray-200 dark:border-gray-800 pt-2"${isOpen ? ' open' : ''}><summary class="text-xs font-bold uppercase tracking-widest text-primary-500 px-3 py-1.5 cursor-pointer select-none flex items-center gap-1"><span class="text-[0.6rem] text-gray-400 transition-transform">▸</span> ${groupLabel}</summary>`;
        sb += docs.map(d => `<a href="${d.path}" class="${currentPath === d.path ? activeClass : inactiveClass}">${d.title}</a>`).join('\n');
        sb += '</details>\n';
      }
      const generalDocs = groups.General;
      if (generalDocs) {
        for (const d of generalDocs) {
          if (d.path !== '/docs') sb += `<a href="${d.path}" class="${currentPath === d.path ? activeClass : inactiveClass}">${d.title}</a>\n`;
        }
      }
      return sb;
    }

    const titleCounts = allDocs.reduce((acc, doc) => {
      acc[doc.title] = (acc[doc.title] || 0) + 1;
      return acc;
    }, {});

    for (const doc of allDocs) {
      const alternates = { en: doc.path };
      const bcParts = [{ name: 'Home', url: '/' }, { name: 'Docs', url: '/docs' }];
      if (doc.path !== '/docs') bcParts.push({ name: doc.title, url: doc.path });
      const defaultDescription = `Lotusia technical documentation for ${doc.title}. Explore specifications, implementation details, and practical guidance.`;
      const metaDescription = clampText(doc.description, 90, 160, defaultDescription);
      const dedupTitle = titleCounts[doc.title] > 1 ? `${doc.title} - ${doc.group}` : doc.title;
      const metaTitle = doc.path === '/docs' ? 'Lotusia Documentation' : buildMetaTitle(dedupTitle, 52);
      const vars = {
        ...makePageMeta('en', doc.path, alternates),
        title: doc.title,
        meta_title: metaTitle,
        description: metaDescription,
        keywords: String(enSeo.docs_keywords || buildKeywords(doc.title, [doc.group, 'documentation', 'technical reference', 'developer guide', 'lotusia docs'])),
        og_image: '/assets/images/logo.png',
        sidebar: buildSidebar(doc.path),
        body: doc.body,
        breadcrumb: breadcrumbHtml(bcParts),
        json_ld: jsonLd(
          {
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: doc.title,
            description: metaDescription,
            url: abs(doc.path),
            articleSection: doc.group,
            isPartOf: { '@type': 'WebSite', name: 'Lotusia', url: SITE_URL },
            author: { '@type': 'Organization', name: 'Lotusia Stewardship' },
            publisher: { '@type': 'Organization', name: 'Lotusia Stewardship', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo.png` } },
            wordCount: (doc.rawBody || '').split(/\s+/).filter(Boolean).length,
            inLanguage: 'en'
          },
          breadcrumbJsonLd(bcParts)
        ),
        head_extra: ''
      };
      writeOutFromPath(doc.path, renderPage('docs', vars));
      setSitemapEntry(sitemap, doc.path, alternates, doc.lastmod);
    }
  }

  return { buildBlog, buildDocs };
}

module.exports = { makeBlogDocsBuilders };
