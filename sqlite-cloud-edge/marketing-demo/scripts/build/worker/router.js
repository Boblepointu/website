const HTML_CACHE_RULES = {
  '/explorer': 120,
  '/explorer/blocks': 120,
  '/explorer/mempool': 90,
  '/explorer/stats': 120,
  '/explorer/richlist': 120,
  '/explorer/network': 120,
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
  hashedAssets: 4838400
};

function htmlCacheTtlForPath(strippedPath) {
  const p = String(strippedPath || '/');
  if (p === '/explorer' || p === '/explorer/') return HTML_CACHE_RULES['/explorer'];
  if (p === '/explorer/blocks') return HTML_CACHE_RULES['/explorer/blocks'];
  if (p === '/explorer/mempool') return HTML_CACHE_RULES['/explorer/mempool'];
  if (p === '/explorer/stats') return HTML_CACHE_RULES['/explorer/stats'];
  if (p === '/explorer/richlist') return HTML_CACHE_RULES['/explorer/richlist'];
  if (p === '/explorer/network') return HTML_CACHE_RULES['/explorer/network'];
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
  } else if (p === '/explorer/mempool') {
    keepParams.push('page', 'pageSize', 'period');
  } else if (p === '/explorer/stats') {
    keepParams.push('period');
  } else if (/^\/social\/[^/]+\/[^/]+\/?$/.test(p)) {
    keepParams.push('page', 'pageSize', 'postsPage', 'postsPageSize', 'votesPage', 'votesPageSize');
  }

  for (const key of keepParams) {
    const value = normalizePositiveIntParam(source.searchParams.get(key));
    if (value !== null) normalized.searchParams.set(key, value);
  }
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
  if (hit) return method === 'HEAD' ? toHeadResponse(hit) : hit;

  const html = await renderFn();
  const response = new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 6}, stale-if-error=${ttl * 24}`
    }
  });
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } else {
    await cache.put(cacheKey, response.clone());
  }
  return method === 'HEAD' ? toHeadResponse(response) : response;
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
  const path = String(pathname || '/').toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  const extMatch = path.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const isHashedAssetPath = /\/assets\/.+\.[a-f0-9]{8,}\./.test(path) || /\.[a-f0-9]{8,}\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?)$/.test(path);

  if (isHashedAssetPath) return STATIC_CACHE_RULES.hashedAssets;
  if (ct.includes('text/html') || (!ext && !path.endsWith('/'))) return STATIC_CACHE_RULES.html;
  if (ct.includes('application/xhtml+xml') || path.endsWith('/')) return STATIC_CACHE_RULES.html;
  if (ext === 'xml' || ct.includes('xml')) return STATIC_CACHE_RULES.xml;
  if (ext === 'txt' || ct.startsWith('text/plain')) return STATIC_CACHE_RULES.text;
  if (ext === 'json' || ct.includes('application/json')) return STATIC_CACHE_RULES.json;
  if (/(css|js|mjs|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|eot|webmanifest)$/.test(ext)) return STATIC_CACHE_RULES.media;
  return STATIC_CACHE_RULES.html;
}

async function cachedMarketingAsset(request, env, ctx) {
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return env.ASSETS.fetch(request);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return method === 'HEAD' ? toHeadResponse(hit) : hit;

  const upstream = await env.ASSETS.fetch(request);
  if (!upstream) return upstream;
  if (upstream.status !== 200) return method === 'HEAD' ? toHeadResponse(upstream) : upstream;

  const path = new URL(request.url).pathname;
  const headers = new Headers(upstream.headers);
  headers.delete('set-cookie');
  const ttl = staticAssetTtl(path, headers.get('content-type'));
  headers.set('cache-control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 6}, stale-if-error=${ttl * 24}`);
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

export default {
  async fetch(request, env, ctx) {
    setSqliteEdgeConfig(
      env && env.SQLITE_EDGE_FUNCTIONS_BASE,
      env && env.SQLITE_EDGE_FUNCTIONS_API_KEY
    );
    const runtimeApiBase = setSocialApiBase(
      (env && (env.SQLITE_EDGE_API_BASE || env.LEGACY_API_BASE)) || 'https://legacy.lotusia.org'
    );

    const url = new URL(request.url);
    const path = url.pathname || '/';
    const lang = detectWorkerLang(path);
    const strippedPath = stripWorkerLangPrefix(path);
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
      return Response.redirect(url.origin + withWorkerLangPrefix(lang, '/social/activity') + (url.search || ''), 301);
    }

    try {
      if (strippedPath === '/explorer/blocks') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerBlocksPage(url, lang);
        });
      }
      if (strippedPath === '/explorer/mempool') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerMempoolPage(url, lang);
        });
      }
      if (strippedPath === '/explorer/stats') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerStatsPage(url, lang);
        });
      }
      if (strippedPath === '/explorer/richlist') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerRichlistPage(url, lang);
        });
      }
      if (strippedPath === '/explorer/network') {
        return cachedHtml(request, strippedPath, ctx, async function() {
          return renderExplorerNetworkPage(lang);
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
      if (strippedPath.startsWith('/explorer/')) {
        return new Response(explorerErrorPage(path, err && err.message ? err.message : 'Unknown error'), {
          status: 502,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
      if (strippedPath.startsWith('/social/')) {
        return new Response(errorPage(path, err && err.message ? err.message : 'Unknown error'), {
          status: 502,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        });
      }
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
      return proxy(request, runtimeApiBase);
    }

    return cachedMarketingAsset(request, env, ctx);
  }
};

