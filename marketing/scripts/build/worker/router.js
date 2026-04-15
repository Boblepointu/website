const HTML_CACHE_RULES = {
  '/explorer': 120,
  '/explorer/blocks': 120,
  '/explorer/block': 240,
  '/explorer/tx': 360,
  '/explorer/address': 240,
  '/social/activity': 120,
  '/social/trending': 240,
  '/social/profiles': 160,
  '/social/profile': 240
};

const PROXY_CACHE_RULES = {
  nuxtAssets: 691200,
  appStatic: 28800
};

const STATIC_CACHE_RULES = {
  html: 14400,
  xml: 7200,
  text: 7200,
  json: 7200,
  media: 691200,
  fonts: 31536000,
  hashedAssets: 31536000
};

function htmlCacheTtlForPath(strippedPath) {
  const p = String(strippedPath || '/');
  if (p === '/explorer' || p === '/explorer/') return HTML_CACHE_RULES['/explorer'];
  if (p === '/explorer/blocks') return HTML_CACHE_RULES['/explorer/blocks'];
  if (p.startsWith('/explorer/block/')) return HTML_CACHE_RULES['/explorer/block'];
  if (p.startsWith('/explorer/tx/')) return HTML_CACHE_RULES['/explorer/tx'];
  if (p.startsWith('/explorer/address/')) return HTML_CACHE_RULES['/explorer/address'];
  if (p === '/social/activity') return HTML_CACHE_RULES['/social/activity'];
  if (p === '/social/trending') return HTML_CACHE_RULES['/social/trending'];
  if (p === '/social/profiles') return HTML_CACHE_RULES['/social/profiles'];
  if (/^\/social\/[^/]+\/[^/]+\/?$/.test(p)) return HTML_CACHE_RULES['/social/profile'];
  return 0;
}

function normalizePositiveIntParam(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(Math.floor(parsed));
}

function htmlCacheKeyUrl(request, strippedPath) {
  const source = new URL(request.url);
  const normalized = new URL(source.origin + source.pathname);
  const keepParams = [];
  const p = String(strippedPath || '/');

  if (p === '/social/activity' || p === '/social/profiles' || p === '/explorer/blocks' || p.startsWith('/explorer/address/')) {
    keepParams.push('page', 'pageSize');
  } else if (/^\/social\/[^/]+\/[^/]+\/?$/.test(p)) {
    keepParams.push('page', 'pageSize', 'postsPage', 'postsPageSize', 'votesPage', 'votesPageSize');
  }

  for (const key of keepParams) {
    const value = normalizePositiveIntParam(source.searchParams.get(key));
    if (value !== null) normalized.searchParams.set(key, value);
  }
  const dv = typeof DEPLOY_VERSION !== 'undefined' ? DEPLOY_VERSION : '0';
  normalized.searchParams.set('_dv', dv);
  return normalized.toString();
}

function toHeadResponse(response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function cachedHtml(request, path, ctx, renderFn) {
  const ttl = htmlCacheTtlForPath(path);
  const method = String(request.method || 'GET').toUpperCase();
  if ((method !== 'GET' && method !== 'HEAD') || ttl <= 0) {
    const html = await renderFn();
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(htmlCacheKeyUrl(request, path), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) {
    const out = new Response(hit.body, { status: hit.status, headers: new Headers(hit.headers) });
    out.headers.set('cloudflare-cdn-cache-control', 'no-store');
    return method === 'HEAD' ? toHeadResponse(out) : out;
  }

  const html = await renderFn();
  const cacheResponse = new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=0, s-maxage=${ttl}`
    }
  });
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));
  } else {
    await cache.put(cacheKey, cacheResponse.clone());
  }
  const clientResponse = new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 6}, stale-if-error=${ttl * 24}`,
      'cloudflare-cdn-cache-control': 'no-store'
    }
  });
  return method === 'HEAD' ? toHeadResponse(clientResponse) : clientResponse;
}

async function cachedProxyGet(request, targetBase, ttl, useCors, ctx) {
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const uncached = await proxy(request, targetBase);
    return useCors ? withCors(uncached) : uncached;
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return method === 'HEAD' ? toHeadResponse(hit) : hit;

  const upstream = await proxy(request, targetBase);
  if (!upstream || upstream.status !== 200) {
    const passthrough = useCors ? withCors(upstream) : upstream;
    return method === 'HEAD' ? toHeadResponse(passthrough) : passthrough;
  }

  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  headers.set('cache-control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 6}`);
  if (useCors) {
    headers.set('access-control-allow-origin', '*');
    headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
    headers.set('access-control-allow-headers', 'Content-Type, Authorization');
  }
  const out = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
  } else {
    await cache.put(cacheKey, out.clone());
  }
  return method === 'HEAD' ? toHeadResponse(out) : out;
}

function staticAssetTtl(pathname, contentType) {
  const p = String(pathname || '/').toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  const extMatch = p.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const isHashedAssetPath = /\/assets\/.+\.[a-f0-9]{8,}\./.test(p) || /\.[a-f0-9]{8,}\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?)$/.test(p);
  const isFont = /^(woff2?|ttf|eot)$/.test(ext);
  const isImage = /^(png|jpe?g|gif|svg|webp|avif|ico)$/.test(ext);

  if (isHashedAssetPath) return { sMaxAge: STATIC_CACHE_RULES.hashedAssets, maxAge: 31536000, immutable: true };
  if (ct.includes('text/html') || (!ext && !p.endsWith('/'))) return { sMaxAge: STATIC_CACHE_RULES.html, maxAge: 0 };
  if (ct.includes('application/xhtml+xml') || p.endsWith('/')) return { sMaxAge: STATIC_CACHE_RULES.html, maxAge: 0 };
  if (ext === 'xml' || ct.includes('xml')) return { sMaxAge: STATIC_CACHE_RULES.xml, maxAge: 3600 };
  if (ext === 'txt' || ct.startsWith('text/plain')) return { sMaxAge: STATIC_CACHE_RULES.text, maxAge: 3600 };
  if (ext === 'json' || ct.includes('application/json')) return { sMaxAge: STATIC_CACHE_RULES.json, maxAge: 3600 };
  if (isFont) return { sMaxAge: STATIC_CACHE_RULES.fonts, maxAge: 31536000, immutable: true };
  if (isImage) return { sMaxAge: STATIC_CACHE_RULES.media, maxAge: 2592000 };
  if (/(css|js|mjs|webmanifest)$/.test(ext)) {
    return { sMaxAge: STATIC_CACHE_RULES.media, maxAge: 31536000, immutable: true };
  }
  return { sMaxAge: STATIC_CACHE_RULES.html, maxAge: 0 };
}

function versionedCacheUrl(url) {
  const v = typeof DEPLOY_VERSION !== 'undefined' ? DEPLOY_VERSION : '0';
  return url + (url.includes('?') ? '&' : '?') + '_dv=' + v;
}

async function cachedMarketingAsset(request, env, ctx) {
  const method = String(request.method || 'GET').toUpperCase();
  const assetUrl = new URL(request.url);
  assetUrl.search = '';
  const upstream = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!upstream || upstream.status !== 200) {
    return method === 'HEAD' ? toHeadResponse(upstream) : upstream;
  }

  const assetPath = new URL(request.url).pathname;
  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  const ttl = staticAssetTtl(assetPath, headers.get('content-type'));
  const cc = ttl.immutable
    ? `public, max-age=${ttl.maxAge}, s-maxage=${ttl.sMaxAge}, immutable`
    : `public, max-age=${ttl.maxAge}, s-maxage=${ttl.sMaxAge}, stale-while-revalidate=${ttl.sMaxAge * 6}, stale-if-error=${ttl.sMaxAge * 24}`;
  headers.set('cache-control', cc);
  const out = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
  return method === 'HEAD' ? toHeadResponse(out) : out;
}

export default {
  async fetch(request, env, ctx) {
    const runtimeApiBase = setSocialApiBase(
      (env && (env.SQLITE_EDGE_API_BASE || env.LEGACY_API_BASE)) || 'https://explorer.burnlotus.fr'
    );

    const url = new URL(request.url);
    if (url.hostname === 'www.lotusia.org') {
      return Response.redirect('https://lotusia.org' + url.pathname + url.search, 301);
    }

    const path = url.pathname || '/';
    const lang = detectWorkerLang(path);
    const strippedPath = stripWorkerLangPrefix(path);
    const legacyNumberedBlog = strippedPath.match(/^\/blog\/\d+\.(.+)$/);
    if (legacyNumberedBlog && legacyNumberedBlog[1]) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, '/blog/' + legacyNumberedBlog[1]) + (url.search || ''),
        301
      );
    }
    const legacyMarkdownBlog = strippedPath.match(/^\/blog\/(.+)\.md$/);
    if (legacyMarkdownBlog && legacyMarkdownBlog[1]) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, '/blog/' + legacyMarkdownBlog[1]) + (url.search || ''),
        301
      );
    }
    const legacySocialProfile = strippedPath.match(/^\/social\/profile\/([^/]+)\/([^/]+)\/?$/);
    if (legacySocialProfile) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, `/social/${legacySocialProfile[1]}/${legacySocialProfile[2]}`) + (url.search || ''),
        301
      );
    }
    const legacySocialProfilesDetail = strippedPath.match(/^\/social\/profiles\/([^/]+)\/([^/]+)\/?$/);
    if (legacySocialProfilesDetail) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, `/social/${legacySocialProfilesDetail[1]}/${legacySocialProfilesDetail[2]}`) + (url.search || ''),
        301
      );
    }
    const legacyBlockPath = strippedPath.match(/^\/block\/([0-9a-fA-F]+)\/?$/);
    if (legacyBlockPath) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, `/explorer/block/${legacyBlockPath[1]}`) + (url.search || ''),
        301
      );
    }
    const legacyTxPath = strippedPath.match(/^\/tx\/([0-9a-fA-F]+)\/?$/);
    if (legacyTxPath) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, `/explorer/tx/${legacyTxPath[1]}`) + (url.search || ''),
        301
      );
    }
    const legacyAddressPath = strippedPath.match(/^\/address\/([^/]+)\/?$/);
    if (legacyAddressPath) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, `/explorer/address/${legacyAddressPath[1]}`) + (url.search || ''),
        301
      );
    }
    const faqNestedExplorer = strippedPath.match(/^\/faq\/explorer\/(block|tx|address)\/([^/]+)\/?$/);
    if (faqNestedExplorer) {
      return Response.redirect(
        'https://lotusia.org' + withWorkerLangPrefix(lang, `/explorer/${faqNestedExplorer[1]}/${faqNestedExplorer[2]}`) + (url.search || ''),
        301
      );
    }
    const appStaticFiles = new Set([
      '/manifest.webmanifest',
      '/favicon.ico',
      '/apple-touch-icon.png',
      '/icon-192.png',
      '/icon-512.png'
    ]);

    if (strippedPath === '/explorer' || strippedPath === '/explorer/') {
      return cachedHtml(request, strippedPath, ctx, async function() {
        return renderExplorerOverviewPage(lang);
      });
    }
    const avatarPath = parseAvatarPath(path);
    if (avatarPath) {
      return cachedAvatarResponse(url, avatarPath.platform, avatarPath.profileId);
    }
    if (strippedPath === '/social' || strippedPath === '/social/') {
      return Response.redirect('https://lotusia.org' + withWorkerLangPrefix(lang, '/social/activity') + (url.search || ''), 301);
    }

    try {
      if (strippedPath === '/explorer/blocks') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerBlocksPage(url, lang);
        });
      }
      const blockPath = parseExplorerBlockPath(path);
      if (blockPath) {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerBlockDetailPage(url, blockPath, lang);
        });
      }
      const txPath = parseExplorerTxPath(path);
      if (txPath) {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerTxDetailPage(url, txPath, lang);
        });
      }
      const addressPath = parseExplorerAddressPath(path);
      if (addressPath) {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerAddressDetailPage(url, addressPath, lang);
        });
      }
      if (strippedPath === '/social/activity') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderActivityPage(url, lang);
        });
      }
      if (strippedPath === '/social/trending') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderTrendingPage(lang);
        });
      }
      if (strippedPath === '/social/profiles') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderProfilesPage(url, lang);
        });
      }
      const profileRoute = parseProfilePath(path);
      if (profileRoute) {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderProfilePage(url, profileRoute.platform, profileRoute.profileId, lang);
        });
      }
    } catch (err) {
      console.error('Worker error:', strippedPath, err);
      if (strippedPath.startsWith('/explorer/')) {
        return new Response(explorerErrorPage(path, err && err.message ? err.message : 'Unknown error'), {
          status: 503,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
      if (strippedPath.startsWith('/social/')) {
        return new Response(errorPage(path, err && err.message ? err.message : 'Unknown error'), {
          status: 503,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
      throw err;
    }

    // App social routes render HTML that references root-level Nuxt assets.
    // These must be fetched from app host or the browser receives marketing HTML.
    if (path.startsWith('/_nuxt/') || appStaticFiles.has(path)) {
      const ttl = path.startsWith('/_nuxt/') ? PROXY_CACHE_RULES.nuxtAssets : PROXY_CACHE_RULES.appStatic;
      return cachedProxyGet(request, 'https://app.lotusia.org', ttl, true, ctx);
    }

    // Nuxt runtime internals (payload/content/navigation) must come from app host.
    if (path.startsWith('/api/_')) {
      return proxy(request, 'https://app.lotusia.org');
    }

    if (path.startsWith('/api/')) {
      const apiPath = path.replace(/^\/api\//, '/api/v1/');
      const apiUrl = new URL(apiPath + url.search, runtimeApiBase);
      const apiReq = new Request(apiUrl.toString(), {
        method: request.method,
        headers: withForwardedHostHeaders(request.headers),
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual'
      });
      const apiRes = await fetch(apiReq);
      return withCors(apiRes);
    }

    return cachedMarketingAsset(request, env, ctx);
  }
};

