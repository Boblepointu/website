'use strict';

const DEFAULT_SOCIAL_API_BASE = 'https://explorer.burnlotus.fr';
let ACTIVE_SOCIAL_API_BASE = DEFAULT_SOCIAL_API_BASE;
const WORKER_LANGS = ['en', 'fr', 'es', 'it', 'de', 'ru', 'cn'];

function detectWorkerLang(pathname) {
  const p = String(pathname || '/');
  const m = p.match(/^\/(fr|es|it|de|ru|cn)(?=\/|$)/);
  return m ? m[1] : 'en';
}

function stripWorkerLangPrefix(pathname) {
  const p = String(pathname || '/');
  const out = p.replace(/^\/(fr|es|it|de|ru|cn)(?=\/|$)/, '');
  return out || '/';
}

function withWorkerLangPrefix(lang, basePath) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  const normalized = String(basePath || '/').startsWith('/') ? String(basePath || '/') : '/' + String(basePath || '/');
  if (safeLang === 'en') return normalized;
  return normalized === '/' ? '/' + safeLang : '/' + safeLang + normalized;
}

function workerI18nValue(lang, path, fallback) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  const pick = function(obj, keyPath) {
    return String(keyPath || '').split('.').reduce(function(acc, key) {
      if (!acc || typeof acc !== 'object' || !(key in acc)) return undefined;
      return acc[key];
    }, obj);
  };
  const fromLang = pick(WORKER_I18N[safeLang], path);
  if (fromLang !== undefined && fromLang !== null) return fromLang;
  const fromEn = pick(WORKER_I18N.en, path);
  if (fromEn !== undefined && fromEn !== null) return fromEn;
  return fallback;
}

function withForwardedHostHeaders(headers) {
  const next = new Headers();
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'host') continue;
    next.set(key, value);
  }
  next.set('x-forwarded-host', 'lotusia.org');
  next.set('x-forwarded-proto', 'https');
  next.set('x-forwarded-port', '443');
  return next;
}

async function proxy(request, targetBase) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${targetBase}${incomingUrl.pathname}${incomingUrl.search}`);
  const method = request.method || 'GET';
  const headers = withForwardedHostHeaders(request.headers);
  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
    redirect: 'manual'
  });
  return fetch(upstreamRequest);
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function fetchNodeApi(path, query) {
  const u = new URL('/api/v1/' + path.replace(/^\/+/, ''), ACTIVE_SOCIAL_API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(u.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('Node API ' + path + ' failed with ' + res.status);
    return res.json();
  } catch (err) {
    console.error('fetchNodeApi error:', path, err.message);
    throw new Error('Node API ' + path + ' unavailable: ' + (err.message || 'unknown error'));
  }
}

async function fetchSocialJson(pathname, query) {
  const subpath = pathname.replace(/^\/api\/social\/?/, '');
  return fetchNodeApi('social/' + subpath, query);
}

async function fetchLegacyJson(pathname, query) {
  const u = new URL(pathname, ACTIVE_SOCIAL_API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  }
  try {
    const res = await fetch(u.toString(), { 
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('Legacy API ' + pathname + ' failed with ' + res.status);
    return res.json();
  } catch (err) {
    console.error('fetchLegacyJson error:', pathname, err.message);
    throw new Error('Legacy API ' + pathname + ' unavailable: ' + (err.message || 'unknown error'));
  }
}

function setSocialApiBase(urlLike) {
  const candidate = String(urlLike || '').trim();
  if (!candidate) {
    ACTIVE_SOCIAL_API_BASE = DEFAULT_SOCIAL_API_BASE;
    return ACTIVE_SOCIAL_API_BASE;
  }
  try {
    const u = new URL(candidate);
    ACTIVE_SOCIAL_API_BASE = u.origin;
  } catch (_) {
    ACTIVE_SOCIAL_API_BASE = DEFAULT_SOCIAL_API_BASE;
  }
  return ACTIVE_SOCIAL_API_BASE;
}

function normalizePeerIp(addr) {
  const text = String(addr || '').trim();
  if (!text) return '';
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    return end > 1 ? text.slice(1, end) : '';
  }
  const colonCount = (text.match(/:/g) || []).length;
  if (colonCount > 1) {
    return text;
  }
  if (colonCount === 1) {
    return text.split(':')[0];
  }
  return text;
}

async function lookupGeoIp(ip) {
  const safeIp = normalizePeerIp(ip);
  if (!safeIp) return { countryCode: '', countryName: '' };
  const cache = caches.default;
  const cacheKey = new Request('https://lotusia.org/_geoip/' + encodeURIComponent(safeIp), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      return await cached.json();
    } catch (_) {}
  }
  try {
    const res = await fetch('https://ipwho.is/' + encodeURIComponent(safeIp) + '?fields=success,country,country_code', {
      cf: { cacheEverything: true, cacheTtl: 691200 }
    });
    if (!res.ok) throw new Error('geoip ' + res.status);
    const payload = await res.json();
    const out = {
      countryCode: payload && payload.success && payload.country_code ? String(payload.country_code).toUpperCase() : '',
      countryName: payload && payload.success && payload.country ? String(payload.country) : ''
    };
    const response = new Response(JSON.stringify(out), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=691200, s-maxage=691200, stale-while-revalidate=691200'
      }
    });
    await cache.put(cacheKey, response.clone());
    return out;
  } catch (_) {
    return { countryCode: '', countryName: '' };
  }
}

function countryFlagEmoji(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(127397 + code.charCodeAt(0), 127397 + code.charCodeAt(1));
}