function workerText(lang, key, fallback) {
  return workerI18nValue(lang, 'worker.' + key, fallback);
}

function parsePageAndSize(url) {
  const pageRaw = Number(url.searchParams.get('page') || 1);
  const pageSizeRaw = Number(url.searchParams.get('pageSize') || 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.floor(pageSizeRaw) : 10;
  return { page, pageSize };
}

function compactStatCard(label, value, hint, icon, options) {
  const opts = options || {};
  const valueClass = opts.valueClass || '';
  const hintClass = opts.hintClass || '';
  const hintHtml = opts.hintHtml || false;
  return '<div class="rounded-2xl border border-gray-200/90 dark:border-gray-700/70 bg-white dark:bg-gray-900 p-3 sm:p-5 shadow-lg shadow-primary-950/10 dark:shadow-black/40 transition-all hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-700">' +
    '<div class="flex items-start gap-2.5 sm:gap-4">' +
    '<span class="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary-500/10 to-sky-500/10 text-primary-600 dark:text-primary-300 h-9 w-9 sm:h-12 sm:w-12 min-w-[2.25rem] sm:min-w-[2.75rem] ring-1 ring-primary-500/20 flex-shrink-0">' + iconSvg(icon || 'chart', 'h-4 w-4 sm:h-6 sm:w-6') + '</span>' +
    '<div class="min-w-0 flex-1"><div class="text-[10px] sm:text-xs uppercase tracking-wide text-gray-600 dark:text-gray-300 font-semibold truncate">' + esc(label) + '</div>' +
    '<div class="text-base sm:text-2xl md:text-3xl font-bold tabular-nums text-gray-900 dark:text-white mt-0.5 sm:mt-1 break-words ' + valueClass + '">' + esc(value) + '</div>' +
    (hint ? '<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5 sm:mt-1 truncate ' + hintClass + '">' + (hintHtml ? String(hint) : esc(hint)) + '</div>' : '') +
    '</div></div>' +
    '</div>';
}

function formatUtc(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const d = new Date((String(value).length > 11 ? n : n * 1000));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short'
  });
}

function formatXpiFromSats(sats) {
  const n = Number(sats || 0);
  if (!Number.isFinite(n)) return '0 XPI';
  const xpi = n / 1000000;
  const text = Number.isInteger(xpi) ? String(xpi) : xpi.toFixed(2);
  return text + ' XPI';
}

function voteRatio(positive, negative) {
  const p = num(positive);
  const n = num(negative);
  const total = p + n;
  if (total <= 0) return '0%';
  return ((p / total) * 100).toFixed(1) + '%';
}

function voteRatioPill(positive, negative) {
  const ratioText = voteRatio(positive, negative);
  const ratioValue = num(ratioText.replace('%', ''));
  const cls = ratioValue >= 90
    ? 'bg-green-50 text-green-600 dark:bg-green-400/10 dark:text-green-400'
    : ratioValue >= 50
    ? 'bg-lime-50 text-lime-600 dark:bg-lime-400/10 dark:text-lime-400'
    : 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400';
  return '<span class="inline-flex items-center rounded-md text-sm font-medium px-2 py-1 ' + cls + '">' + esc(ratioText) + ' Positive</span>';
}

function pseudoInitial(value) {
  const text = String(value || '');
  const match = text.match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

function avatarDataUri(profileId, size) {
  const id = String(profileId || '?');
  const initial = esc(pseudoInitial(id));
  const px = Number.isFinite(size) ? Math.max(24, Math.floor(size)) : 64;
  const radius = Math.floor(px / 2);
  const fontSize = Math.max(12, Math.floor(px * 0.38));
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + px + ' ' + px + '">' +
    '<rect width="' + px + '" height="' + px + '" rx="' + radius + '" fill="#4f46e5"/>' +
    '<text x="' + Math.floor(px / 2) + '" y="' + Math.floor(px * 0.62) + '" text-anchor="middle" font-family="sans-serif" font-size="' + fontSize + '" font-weight="700" fill="#ffffff">' + initial + '</text>' +
    '</svg>'
  );
}

function avatarSourceList(platform, profileId, primarySrc) {
  const pid = String(profileId || '');
  const safePlatform = String(platform || 'twitter').toLowerCase();
  const list = [];
  const pushIf = function(value) {
    const src = String(value || '').trim();
    if (!src) return;
    if (list.indexOf(src) === -1) list.push(src);
  };

  pushIf(primarySrc);
  pushIf(avatarProxyUrl(safePlatform, pid));
  if (safePlatform === 'twitter') {
    pushIf('https://unavatar.io/x/' + encodeURIComponent(pid));
    pushIf('https://unavatar.io/twitter/' + encodeURIComponent(pid));
    pushIf('https://unavatar.io/' + encodeURIComponent(pid));
  } else {
    pushIf('https://www.gravatar.com/avatar/' + encodeURIComponent(pid) + '?s=96&d=identicon&r=g');
  }
  pushIf(avatarDataUri(pid, 96));
  return list;
}

function encodeAvatarSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map(function(src) { return encodeURIComponent(String(src || '')); })
    .join(',');
}

function renderAvatarHtml(platform, profileId, options) {
  const opts = options || {};
  const pid = String(profileId || '');
  const safePlatform = String(platform || 'twitter').toLowerCase();
  const initial = pseudoInitial(pid);
  const size = opts.size === 'lg' ? 'lg' : 'sm';
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-8 w-8 text-xs';
  const sizeStyle = size === 'lg'
    ? 'width:3.5rem;height:3.5rem;min-width:3.5rem;'
    : 'width:2rem;height:2rem;min-width:2rem;';
  const ringClass = opts.ringClass || 'ring-2 ring-primary-300/40';
  const extraClass = opts.className || '';
  const sources = avatarSourceList(safePlatform, pid, opts.primarySrc || '');
  const sourceAttr = encodeAvatarSources(sources);
  const firstSrc = sources[0] || avatarDataUri(pid, size === 'lg' ? 112 : 64);
  return '<span class="relative inline-flex items-center justify-center rounded-full bg-primary-600 text-white font-bold overflow-hidden flex-shrink-0 ' + sizeClass + ' ' + ringClass + ' ' + extraClass + '" style="' + sizeStyle + '" data-avatar-root>' +
    '<span class="absolute inset-0 flex items-center justify-center">' + esc(initial) + '</span>' +
    '<img src="' + esc(firstSrc) + '" alt="' + esc(pid) + ' avatar" class="absolute inset-0 h-full w-full object-cover" width="' + (size === 'lg' ? '56' : '32') + '" height="' + (size === 'lg' ? '56' : '32') + '" loading="lazy" decoding="async" data-avatar-img data-avatar-sources="' + sourceAttr + '">' +
    '</span>';
}

function sectionHeader(icon, title, subtitle, badgeHtml) {
  return '<div class="mb-8 border-b border-gray-200 dark:border-gray-800 pb-5">' +
    '<div class="flex items-start gap-3">' +
    '<span class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300 ring-1 ring-primary-500/25">' + iconSvg(icon, 'h-6 w-6') + '</span>' +
    '<div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h1 class="text-2xl font-bold text-gray-900 dark:text-white">' + esc(title) + '</h1>' + (badgeHtml || '') + '</div>' +
    '<p class="text-sm text-gray-600 dark:text-gray-300 mt-1">' + esc(subtitle) + '</p></div></div></div>';
}

function middleEllipsis(value, head, tail) {
  const text = String(value || '');
  const keepHead = Number.isFinite(head) ? head : 12;
  const keepTail = Number.isFinite(tail) ? tail : 10;
  if (text.length <= keepHead + keepTail + 1) return text;
  return text.slice(0, keepHead) + '...' + text.slice(-keepTail);
}

function profileCellHtml(platform, profileId, options) {
  const opts = options || {};
  const lang = WORKER_LANGS.includes(opts.lang) ? opts.lang : 'en';
  const handle = String(profileId || '');
  const avatar = renderAvatarHtml(platform, handle, { size: 'sm' });
  const href = withWorkerLangPrefix(lang, '/social/' + esc(platform) + '/' + esc(profileId));
  return '<div class="flex items-center gap-2">' +
    avatar +
    '<a class="font-semibold text-sm text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" style="max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;" href="' + href + '">' + esc(handle) + '</a>' +
    iconSvg('x', 'h-4 w-4 text-sky-500 dark:text-sky-400') +
    '</div>';
}

function socialAvatarSrc(profile, platform, profileId) {
  const meta = profile && typeof profile.profileMeta === 'object' ? profile.profileMeta : null;
  const fromMeta = meta
    ? (meta.avatarB64 || meta.avatarBase64 || meta.avatar || meta.image || meta.profileImage || meta.profile_image_url || null)
    : null;
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    if (fromMeta.startsWith('data:image/')) return fromMeta;
    if (fromMeta.startsWith('http://') || fromMeta.startsWith('https://')) return fromMeta;
    if (/^[A-Za-z0-9+/=]+$/.test(fromMeta)) return 'data:image/jpeg;base64,' + fromMeta;
  }
  return avatarProxyUrl(platform, profileId);
}

function parseAvatarPath(pathname) {
  const m = pathname.match(/^\/_avatar\/(twitter|gravatar)\/([^/]+)\/?$/);
  if (!m) return null;
  return { platform: m[1], profileId: decodeURIComponent(m[2]) };
}

function avatarFallbackSvg(profileId) {
  const id = String(profileId || '?');
  const initial = esc(id.charAt(0).toUpperCase() || '?');
  const bg = '1e293b';
  const fg = 'cbd5e1';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#' + bg + '"/><text x="48" y="58" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="700" fill="#' + fg + '">' + initial + '</text></svg>';
}

async function cachedAvatarResponse(url, platform, profileId) {
  const cache = caches.default;
  const cacheKey = new Request(url.origin + '/_avatar/' + platform + '/' + encodeURIComponent(profileId), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const isFallback = cached.headers.get('x-avatar-fallback') === '1';
    if (!isFallback) return cached;
    const cachedAt = Number(cached.headers.get('x-avatar-cached-at') || 0);
    if (Number.isFinite(cachedAt) && cachedAt > 0 && (Date.now() - cachedAt) < 10000) return cached;
  }

  const upstream = platform === 'twitter'
    ? 'https://unavatar.io/x/' + encodeURIComponent(profileId)
    : 'https://www.gravatar.com/avatar/' + encodeURIComponent(profileId) + '?s=96&d=identicon&r=g';
  try {
    const res = await fetch(upstream, { cf: { cacheEverything: true, cacheTtl: 691200 } });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('image')) {
      const headers = new Headers(res.headers);
      headers.set('cache-control', 'public, max-age=691200, s-maxage=691200, stale-while-revalidate=345600');
      headers.set('access-control-allow-origin', '*');
      headers.set('x-avatar-fallback', '0');
      headers.set('x-avatar-cached-at', String(Date.now()));
      const out = new Response(res.body, { status: 200, headers });
      await cache.put(cacheKey, out.clone());
      return out;
    }
  } catch (_) {}

  const svg = avatarFallbackSvg(profileId);
  const out = new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=80, s-maxage=80, stale-while-revalidate=80',
      'access-control-allow-origin': '*',
      'x-avatar-fallback': '1',
      'x-avatar-cached-at': String(Date.now())
    }
  });
  await cache.put(cacheKey, out.clone());
  return out;
}

function voteToneHtml(sentiment, sats) {
  if (sentiment === 'positive') return '<span class="flex items-center gap-1 text-green-500 dark:text-green-400">' + iconSvg('up', 'h-4 w-4') + esc(formatXpiFromSats(sats)) + '</span>';
  if (sentiment === 'negative') return '<span class="flex items-center gap-1 text-red-500 dark:text-red-400">' + iconSvg('down', 'h-4 w-4') + esc(formatXpiFromSats(sats)) + '</span>';
  return '<span class="flex items-center gap-1 text-gray-600 dark:text-gray-300">' + iconSvg('minus', 'h-4 w-4') + '0 XPI</span>';
}

function paginationHtml(basePath, page, pageSize, numPages, options) {
  const opts = options || {};
  const lang = WORKER_LANGS.includes(opts.lang) ? opts.lang : 'en';
  const rowsPerPageLabel = workerText(lang, 'rows_per_page', 'Rows per page');
  const pageLabel = workerText(lang, 'page', 'Page');
  const ofLabel = workerText(lang, 'of', 'of');
  const pageParam = String(opts.pageParam || 'page');
  const pageSizeParam = String(opts.pageSizeParam || 'pageSize');
  const groupId = String(opts.groupId || '').trim();
  const groupAttr = groupId ? ' data-pagination-group="' + esc(groupId) + '"' : '';
  const extraParams = opts.extraParams && typeof opts.extraParams === 'object' ? opts.extraParams : {};
  const safePage = Math.max(1, Math.min(page, Math.max(1, num(numPages) || 1)));
  const totalPages = Math.max(1, num(numPages) || 1);
  const mk = function(targetPage, targetSize) {
    const queryParts = [];
    queryParts.push(encodeURIComponent(pageParam) + '=' + encodeURIComponent(String(targetPage)));
    queryParts.push(encodeURIComponent(pageSizeParam) + '=' + encodeURIComponent(String(targetSize)));
    Object.keys(extraParams).forEach(function(key) {
      const value = extraParams[key];
      if (value === undefined || value === null || value === '') return;
      queryParts.push(encodeURIComponent(String(key)) + '=' + encodeURIComponent(String(value)));
    });
    return basePath + '?' + queryParts.join('&');
  };
  const pageSizes = [10, 20, 30, 40];
  const pageSizeItems = pageSizes.map(function(size) {
    if (size === pageSize) {
      return '<span class="block px-3 py-2 text-sm font-semibold rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 tabular-nums">' + size + '</span>';
    }
    return '<a href="' + mk(1, size) + '" class="block px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 tabular-nums">' + size + '</a>';
  }).join('');
  const selectControl = '<div class="relative w-28" data-page-size-root>' +
    '<button type="button" aria-label="' + esc(rowsPerPageLabel) + '" data-page-size-select="1" aria-expanded="false" class="inline-flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 px-3 text-sm font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-900 shadow-sm hover:border-primary-300 dark:hover:border-primary-700 transition-colors tabular-nums">' +
    '<span>' + pageSize + '</span><span class="text-xs text-gray-400">▾</span></button>' +
    '<div class="hidden absolute top-full left-0 mt-1 w-28 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg p-1.5 z-50" data-page-size-menu>' + pageSizeItems + '</div>' +
    '</div>';
  const prevDisabled = safePage <= 1;
  const nextDisabled = safePage >= totalPages;
  const windowStart = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const pageButtons = [];
  for (let p = windowStart; p <= windowEnd; p += 1) {
    if (p === safePage) pageButtons.push('<span class="inline-flex items-center justify-center min-w-[2.5rem] sm:w-[4.4rem] h-10 sm:h-11 px-2 text-xs sm:text-sm rounded-xl bg-primary-500 text-white dark:bg-primary-400 dark:text-gray-900 font-bold shadow-sm ring-2 ring-primary-500/25 tabular-nums whitespace-nowrap">' + p + '</span>');
    else pageButtons.push('<a href="' + mk(p, pageSize) + '" class="inline-flex items-center justify-center min-w-[2.5rem] sm:w-[4.4rem] h-10 sm:h-11 px-2 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors tabular-nums whitespace-nowrap">' + p + '</a>');
  }
  const endCaps = (windowStart > 1 ? '<a href="' + mk(1, pageSize) + '" class="inline-flex items-center justify-center min-w-[2.5rem] sm:w-[4.4rem] h-10 sm:h-11 px-2 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors tabular-nums whitespace-nowrap">1</a><span class="px-0.5 sm:px-1 text-gray-500 whitespace-nowrap" aria-hidden="true">…</span>' : '') +
    pageButtons.join('') +
    (windowEnd < totalPages ? '<span class="px-0.5 sm:px-1 text-gray-500 whitespace-nowrap" aria-hidden="true">…</span><a href="' + mk(totalPages, pageSize) + '" class="inline-flex items-center justify-center min-w-[2.5rem] sm:w-[4.4rem] h-10 sm:h-11 px-2 text-xs sm:text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors tabular-nums whitespace-nowrap">' + totalPages + '</a>' : '');
  const prevLabel = workerText(lang, 'previous_page', 'Previous page');
  const nextLabel = workerText(lang, 'next_page', 'Next page');
  const prevLink = prevDisabled
    ? '<span class="inline-flex items-center justify-center rounded-xl h-10 w-10 sm:h-11 sm:w-11 text-gray-400 border border-gray-200 dark:border-gray-800" aria-hidden="true">' + iconSvg('prev', 'h-4 w-4 sm:h-5 sm:w-5') + '</span>'
    : '<a class="inline-flex items-center justify-center rounded-xl h-10 w-10 sm:h-11 sm:w-11 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" href="' + mk(safePage - 1, pageSize) + '" aria-label="' + esc(prevLabel) + '">' + iconSvg('prev', 'h-4 w-4 sm:h-5 sm:w-5') + '</a>';
  const nextLink = nextDisabled
    ? '<span class="inline-flex items-center justify-center rounded-xl h-10 w-10 sm:h-11 sm:w-11 text-gray-400 border border-gray-200 dark:border-gray-800" aria-hidden="true">' + iconSvg('next', 'h-4 w-4 sm:h-5 sm:w-5') + '</span>'
    : '<a class="inline-flex items-center justify-center rounded-xl h-10 w-10 sm:h-11 sm:w-11 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" href="' + mk(safePage + 1, pageSize) + '" aria-label="' + esc(nextLabel) + '">' + iconSvg('next', 'h-4 w-4 sm:h-5 sm:w-5') + '</a>';
  if (totalPages <= 1) return '';
  return '<div class="mt-0 rounded-b-2xl border border-gray-200/90 dark:border-gray-700/70 border-t-0 bg-gray-50/70 dark:bg-gray-900/60 px-4 py-3 overflow-visible"' + groupAttr + '>' +
    '<div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">' +
    '<div class="flex items-center gap-3"><span class="text-sm font-semibold text-gray-700 dark:text-gray-200">' + esc(rowsPerPageLabel) + '</span>' + selectControl + '</div>' +
    '<div class="flex flex-wrap items-center gap-1.5 sm:gap-3"><span class="inline-flex items-center justify-center h-10 sm:h-11 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-xl tabular-nums whitespace-nowrap">' + esc(pageLabel) + ' ' + safePage + ' ' + esc(ofLabel) + ' ' + totalPages + '</span><div class="flex flex-wrap items-center gap-1.5 sm:gap-2">' + prevLink + endCaps + nextLink + '</div></div>' +
    '</div>' +
    '</div>';
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '-';
  return formatNumber(n) + ' B';
}

function shortHash(value) {
  const text = String(value || '');
  if (text.length <= 18) return text;
  return text.slice(0, 1) + '...' + text.slice(-16);
}

function parseExplorerBlockPath(pathname) {
  const m = stripWorkerLangPrefix(pathname).match(/^\/explorer\/block\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseExplorerTxPath(pathname) {
  const m = stripWorkerLangPrefix(pathname).match(/^\/explorer\/tx\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseExplorerAddressPath(pathname) {
  const m = stripWorkerLangPrefix(pathname).match(/^\/explorer\/address\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function seoAbsoluteUrl(pathname) {
  return 'https://lotusia.org' + String(pathname || '/');
}

function seoBreadcrumbGraph(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: list.map(function(item, idx) {
      return {
        '@type': 'ListItem',
        position: idx + 1,
        name: String((item && item.label) || ''),
        item: seoAbsoluteUrl((item && item.href) || '/')
      };
    })
  };
}

function seoPageGraph(pathname, title, description, pageType) {
  return {
    '@type': pageType || 'WebPage',
    name: String(title || ''),
    description: String(description || ''),
    url: seoAbsoluteUrl(pathname || '/'),
    isPartOf: {
      '@type': 'WebSite',
      name: 'Lotusia',
      url: 'https://lotusia.org'
    }
  };
}

function seoItemListGraph(name, items) {
  const list = Array.isArray(items) ? items : [];
  return {
    '@type': 'ItemList',
    name: String(name || ''),
    itemListElement: list.map(function(item, idx) {
      const node = {
        '@type': 'ListItem',
        position: idx + 1,
        name: String((item && item.name) || '')
      };
      if (item && item.url) node.url = String(item.url);
      return node;
    })
  };
}

function seoJsonLd(graphItems) {
  const graph = (Array.isArray(graphItems) ? graphItems : []).filter(Boolean);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph
  });
}