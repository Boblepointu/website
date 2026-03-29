async function renderActivityPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.social_activity_keywords', [
    'Lotusia',
    workerText(safeLang, 'social', 'Social'),
    workerText(safeLang, 'activity', 'Activity'),
    workerText(safeLang, 'votes', 'Votes'),
    workerText(safeLang, 'profile', 'Profile'),
    workerText(safeLang, 'ranking', 'Ranking')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const params = parsePageAndSize(url);
  const payload = await fetchSocialJson('/api/social/activity', { page: params.page, pageSize: params.pageSize });
  const rows = (payload.votes || []).map(v => {
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/tx/' + esc(v.txid)) + '">' + esc((v.txid || '').slice(0, 12)) + '...</a></td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatUtc(v.firstSeen)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + profileCellHtml(v.platform || 'twitter', v.profileId || '', { lang: safeLang }) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + voteToneHtml(String(v.sentiment || 'neutral'), v.sats) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400"><a class="inline-flex items-center text-sky-500 dark:text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer" href="https://x.com/' + esc(v.profileId) + '/status/' + esc(v.postId) + '">' + esc(v.postId) + iconSvg('external', 'ml-2 h-4 w-4 text-gray-400') + '</a></td>' +
      '</tr>';
  });
  const canonical = localize('/social/activity') + '?page=' + params.page + '&pageSize=' + params.pageSize;
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'social', 'Social'), href: localize('/social/activity') },
    { label: workerText(safeLang, 'activity', 'Activity'), href: localize('/social/activity') }
  ];
  const title = workerText(safeLang, 'title_latest_activity', 'Latest Activity');
  const description = workerText(safeLang, 'desc_latest_activity', 'Fresh social vote activity across profiles on Lotusia, including sentiment, vote amount, and linked post details.');
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'CollectionPage'),
    seoItemListGraph('Latest social votes', (payload.votes || []).slice(0, 10).map(function(v) {
      return {
        name: String(v.profileId || 'Unknown profile') + ' vote ' + String(v.sentiment || 'neutral'),
        url: v.txid ? seoAbsoluteUrl(localize('/explorer/tx/' + encodeURIComponent(v.txid))) : ''
      };
    }))
  ]);
  const bodyInner = sectionHeader('chart', workerText(safeLang, 'vote_activity', 'Vote Activity'), workerText(safeLang, 'vote_activity_subtitle', 'Vote activity for all profiles across all platforms.')) +
    renderTable([workerText(safeLang, 'tx_id', 'Transaction ID'), workerText(safeLang, 'first_seen', 'First Seen'), workerText(safeLang, 'profile', 'Profile'), workerText(safeLang, 'vote', 'Vote'), workerText(safeLang, 'post_id', 'Post ID')], rows, workerText(safeLang, 'no_recent_activity', 'No recent activity.'), { withPagination: true, lang: safeLang, tableKind: 'activity' }) +
    paginationHtml(localize('/social/activity'), params.page, params.pageSize, payload.numPages, { lang: safeLang });
  const body = legacyExplorerLayout('latest', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderTrendingPage(lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.social_trending_keywords', [
    'Lotusia',
    workerText(safeLang, 'social', 'Social'),
    workerText(safeLang, 'trending', 'Trending'),
    workerText(safeLang, 'top_ranked_profiles', 'Top Ranked Profiles'),
    workerText(safeLang, 'lowest_ranked_profiles', 'Lowest Ranked Profiles'),
    workerText(safeLang, 'top_ranked_posts', 'Top Ranked Posts')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const rankValue = function(entity) {
    const raw = entity && (entity.ranking ?? entity.rate ?? entity.score ?? 0);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const rankToneClass = function(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n === 0) return 'text-gray-500 dark:text-gray-400';
    return n > 0 ? 'text-green-400 dark:text-green-300' : 'text-red-400 dark:text-red-300';
  };
  const [profilesPayload, topProfiles, lowProfiles, topPosts, lowPosts] = await Promise.all([
    fetchSocialJson('/api/social/profiles', { page: 1, pageSize: 100 }),
    fetchSocialJson('/api/social/stats/profiles/top-ranked/today').catch(() => []),
    fetchSocialJson('/api/social/stats/profiles/lowest-ranked/today').catch(() => []),
    fetchSocialJson('/api/social/stats/posts/top-ranked/today').catch(() => []),
    fetchSocialJson('/api/social/stats/posts/lowest-ranked/today').catch(() => [])
  ]);
  const allProfiles = profilesPayload.profiles || [];
  const topSeed = Array.isArray(topProfiles) && topProfiles.length
    ? topProfiles
    : allProfiles.slice().sort((a, b) => rankValue(b) - rankValue(a)).slice(0, 10);
  const lowSeed = Array.isArray(lowProfiles) && lowProfiles.length
    ? lowProfiles
    : allProfiles.slice().sort((a, b) => rankValue(a) - rankValue(b)).slice(0, 10);
  const topRows = topSeed.map(function(p) {
    const platform = p.platform || p.provider || 'twitter';
    const profileId = p.profileId || p.id || p.handle || '';
    const ranking = rankValue(p);
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + profileCellHtml(platform, profileId, { lang: safeLang }) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums ' + rankToneClass(ranking) + '">' + esc(formatXpiFromSats(ranking)) + '</td></tr>';
  });
  const lowRows = lowSeed.map(function(p) {
    const platform = p.platform || p.provider || 'twitter';
    const profileId = p.profileId || p.id || p.handle || '';
    const ranking = rankValue(p);
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + profileCellHtml(platform, profileId, { lang: safeLang }) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums ' + rankToneClass(ranking) + '">' + esc(formatXpiFromSats(ranking)) + '</td></tr>';
  });
  let topPostSeed = Array.isArray(topPosts) ? topPosts : [];
  let lowPostSeed = Array.isArray(lowPosts) ? lowPosts : [];
  if (!topPostSeed.length || !lowPostSeed.length) {
    const candidates = allProfiles.slice(0, 8);
    const postsByProfile = await Promise.all(candidates.map(function(p) {
      return fetchSocialJson('/api/social/' + encodeURIComponent(p.platform) + '/' + encodeURIComponent(p.id) + '/posts', { page: 1, pageSize: 8 })
        .then(function(payload) {
          return (payload.posts || []).map(function(post) {
            return {
              profileId: p.id,
              platform: p.platform,
              postId: post.id,
              ranking: post.ranking
            };
          });
        })
        .catch(() => []);
    }));
    const merged = postsByProfile.flat().filter(function(p) { return p && p.postId; });
    if (!topPostSeed.length) topPostSeed = merged.slice().sort((a, b) => rankValue(b) - rankValue(a)).slice(0, 10);
    if (!lowPostSeed.length) lowPostSeed = merged.slice().sort((a, b) => rankValue(a) - rankValue(b)).slice(0, 10);
  }
  const topPostRows = topPostSeed.map(function(p) {
    const pid = p.profileId || p.profile || '';
    const post = p.postId || (p.post && p.post.id) || '';
    const ranking = rankValue(p);
    return '<tr><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400"><a class="inline-flex items-center text-sky-500 dark:text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer" href="https://x.com/' + esc(pid) + '/status/' + esc(post) + '">' + esc(pid + '/' + post) + iconSvg('external', 'ml-2 h-4 w-4 text-gray-400') + '</a></td><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums ' + rankToneClass(ranking) + '">' + esc(formatXpiFromSats(ranking)) + '</td></tr>';
  });
  const lowPostRows = lowPostSeed.map(function(p) {
    const pid = p.profileId || p.profile || '';
    const post = p.postId || (p.post && p.post.id) || '';
    const ranking = rankValue(p);
    return '<tr><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400"><a class="inline-flex items-center text-sky-500 dark:text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer" href="https://x.com/' + esc(pid) + '/status/' + esc(post) + '">' + esc(pid + '/' + post) + iconSvg('external', 'ml-2 h-4 w-4 text-gray-400') + '</a></td><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums ' + rankToneClass(ranking) + '">' + esc(formatXpiFromSats(ranking)) + '</td></tr>';
  });
  const canonical = localize('/social/trending');
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'social', 'Social'), href: localize('/social/activity') },
    { label: workerText(safeLang, 'trending', 'Trending'), href: localize('/social/trending') }
  ];
  const title = workerText(safeLang, 'title_trending_profiles', 'Trending Profiles');
  const description = workerText(safeLang, 'desc_trending_profiles', 'Top and lowest ranked social profiles and posts on Lotusia, updated continuously from live ranking data.');
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'CollectionPage'),
    seoItemListGraph('Top ranked profiles today', topSeed.slice(0, 10).map(function(p) {
      const platform = p.platform || p.provider || 'twitter';
      const id = p.profileId || p.id || p.handle || '';
      return {
        name: String(id || 'Unknown profile'),
        url: id ? seoAbsoluteUrl(localize('/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(id))) : ''
      };
    }))
  ]);
  const bodyInner = sectionHeader('chart', workerText(safeLang, 'trending', 'Trending'), workerText(safeLang, 'trending_subtitle', 'Top and lowest ranked profiles and posts over today.')) +
    '<div class="grid md:grid-cols-2 gap-6 auto-rows-fr">' +
    '<section class="flex flex-col h-full"><h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'top_ranked_profiles', 'Top Ranked Profiles')) + '</h2><div class="flex-1">' + renderTable([workerText(safeLang, 'profile', 'Profile'), workerText(safeLang, 'ranking', 'Ranking')], topRows, workerText(safeLang, 'no_profile_trend_data', 'No profile trend data.'), { lang: safeLang, tableKind: 'profile-rank' }) + '</div></section>' +
    '<section class="flex flex-col h-full"><h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'lowest_ranked_profiles', 'Lowest Ranked Profiles')) + '</h2><div class="flex-1">' + renderTable([workerText(safeLang, 'profile', 'Profile'), workerText(safeLang, 'ranking', 'Ranking')], lowRows, workerText(safeLang, 'no_profile_trend_data', 'No profile trend data.'), { lang: safeLang, tableKind: 'profile-rank' }) + '</div></section>' +
    '<section class="flex flex-col h-full"><h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'top_ranked_posts', 'Top Ranked Posts')) + '</h2><div class="flex-1">' + renderTable([workerText(safeLang, 'post', 'Post'), workerText(safeLang, 'ranking', 'Ranking')], topPostRows, workerText(safeLang, 'no_post_trend_data', 'No post trend data.'), { lang: safeLang, tableKind: 'post-rank' }) + '</div></section>' +
    '<section class="flex flex-col h-full"><h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'lowest_ranked_posts', 'Lowest Ranked Posts')) + '</h2><div class="flex-1">' + renderTable([workerText(safeLang, 'post', 'Post'), workerText(safeLang, 'ranking', 'Ranking')], lowPostRows, workerText(safeLang, 'no_post_trend_data', 'No post trend data.'), { lang: safeLang, tableKind: 'post-rank' }) + '</div></section>' +
    '</div>';
  const body = legacyExplorerLayout('trending', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderProfilesPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.social_profiles_keywords', [
    'Lotusia',
    workerText(safeLang, 'social', 'Social'),
    workerText(safeLang, 'profiles', 'Profiles'),
    workerText(safeLang, 'ranking', 'Ranking'),
    workerText(safeLang, 'vote_ratio', 'Vote Ratio')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const params = parsePageAndSize(url);
  const payload = await fetchSocialJson('/api/social/profiles', { page: params.page, pageSize: params.pageSize });
  const rankToneClass = function(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n === 0) return 'text-gray-500 dark:text-gray-400';
    return n > 0 ? 'text-green-400 dark:text-green-300' : 'text-red-400 dark:text-red-300';
  };
  const rows = (payload.profiles || []).map(function(p, idx) {
      const rank = ((params.page - 1) * params.pageSize) + idx + 1;
      return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + formatNumber(rank) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + profileCellHtml(p.platform, p.id, { lang: safeLang }) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums ' + rankToneClass(p.ranking) + '">' + esc(formatXpiFromSats(p.ranking)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + voteRatioPill(p.votesPositive, p.votesNegative) + '</td>' +
      '</tr>';
  });
  const canonical = localize('/social/profiles') + '?page=' + params.page + '&pageSize=' + params.pageSize;
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'social', 'Social'), href: localize('/social/activity') },
    { label: workerText(safeLang, 'profiles', 'Profiles'), href: localize('/social/profiles') }
  ];
  const title = workerText(safeLang, 'title_social_profiles', 'Social Profiles');
  const description = workerText(safeLang, 'desc_social_profiles', 'Public social profile rankings on Lotusia with vote ratio, profile score, and direct links to profile activity pages.');
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'CollectionPage'),
    seoItemListGraph('Social profiles', (payload.profiles || []).slice(0, 20).map(function(p) {
      return {
        name: String((p && p.id) || 'Unknown profile'),
        url: p && p.id ? seoAbsoluteUrl(localize('/social/' + encodeURIComponent(p.platform || 'twitter') + '/' + encodeURIComponent(p.id))) : ''
      };
    }))
  ]);
  const bodyInner = sectionHeader('profile', workerText(safeLang, 'profiles', 'Profiles'), workerText(safeLang, 'profiles_subtitle', 'Browse profiles on Lotusia Social.')) +
    renderTable(['#', workerText(safeLang, 'profile', 'Profile'), workerText(safeLang, 'ranking', 'Ranking'), workerText(safeLang, 'vote_ratio', 'Vote Ratio')], rows, workerText(safeLang, 'no_profiles_found', 'No profiles found.'), { withPagination: true, lang: safeLang, tableKind: 'profiles' }) +
    paginationHtml(localize('/social/profiles'), params.page, params.pageSize, payload.numPages, { lang: safeLang });
  const body = legacyExplorerLayout('profiles', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderProfilePage(url, platform, profileId, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.social_profiles_keywords', [
    'Lotusia',
    workerText(safeLang, 'social', 'Social'),
    platform,
    profileId,
    workerText(safeLang, 'ranking', 'Ranking'),
    workerText(safeLang, 'votes', 'Votes'),
    workerText(safeLang, 'posts', 'Posts')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const rankToneClass = function(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n === 0) return 'text-gray-500 dark:text-gray-400';
    return n > 0 ? 'text-green-400 dark:text-green-300' : 'text-red-400 dark:text-red-300';
  };
  const intParam = function(name, fallback) {
    const raw = Number(url.searchParams.get(name));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  };
  const legacyPage = intParam('page', 1);
  const legacyPageSize = intParam('pageSize', 10);
  const postsPage = intParam('postsPage', legacyPage);
  const postsPageSize = intParam('postsPageSize', legacyPageSize);
  const votesPage = intParam('votesPage', legacyPage);
  const votesPageSize = intParam('votesPageSize', legacyPageSize);
  const [profile, posts, votes] = await Promise.all([
    fetchSocialJson('/api/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId)),
    fetchSocialJson('/api/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId) + '/posts', { page: postsPage, pageSize: postsPageSize }),
    fetchSocialJson('/api/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId) + '/votes', { page: votesPage, pageSize: votesPageSize })
  ]);
  const avatarSrc = socialAvatarSrc(profile, platform, profileId);
  const profileAvatar = renderAvatarHtml(platform, profileId, {
    size: 'lg',
    className: 'shadow-sm',
    primarySrc: avatarSrc
  });
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'social', 'Social'), href: localize('/social/activity') },
    { label: platform.charAt(0).toUpperCase() + platform.slice(1), href: localize('/social/profiles') },
    { label: profileId, href: localize('/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId)) }
  ];
  const canonicalPath = localize('/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId));
  const profileTitle = profileId + ' on ' + platform;
  const description = 'View ' + profileId + ' social reputation, posts, and vote history on Lotusia.';
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonicalPath, profileTitle, description, 'ProfilePage'),
    {
      '@type': 'Person',
      name: String(profileId),
      sameAs: String(platform).toLowerCase() === 'twitter'
        ? ['https://x.com/' + encodeURIComponent(profileId)]
        : undefined,
      url: seoAbsoluteUrl(canonicalPath),
      image: avatarSrc
    }
  ]);

  const postsRows = (posts.posts || []).map(post => '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400"><a class="inline-flex items-center text-sky-500 dark:text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer" href="https://x.com/' + esc(profileId) + '/status/' + esc(post.id) + '">' + esc(post.id) + iconSvg('external', 'ml-2 h-4 w-4 text-gray-400') + '</a></td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums ' + rankToneClass(post.ranking) + '">' + esc(formatXpiFromSats(post.ranking)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + voteRatioPill(post.votesPositive, post.votesNegative) + '</td>' +
      '</tr>');
  const votesRows = (votes.votes || []).map(v => '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/tx/' + esc(v.txid)) + '">' + esc((v.txid || '').slice(0, 12)) + '...</a></td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatUtc(v.timestamp)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm text-gray-500 dark:text-gray-400">' + voteToneHtml(String(v.sentiment || 'neutral'), v.sats) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(v.sats)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc((v.post && v.post.id) || '') + '</td>' +
      '</tr>');
  const postsNumPages = Math.max(1, num(posts.numPages) || 1);
  const votesNumPages = Math.max(1, num(votes.numPages) || 1);
  const bodyInner = '<div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 mb-10">' +
    '<div class="flex flex-wrap items-center gap-4 mb-4">' +
    profileAvatar +
    '<div>' +
    '<h1 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">' + esc(profileId) + iconSvg('x', 'h-5 w-5 text-sky-500 dark:text-sky-400') + '</h1>' +
    '<p class="text-base text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">' + esc(workerText(safeLang, 'live_profile_data', 'Live profile data')) + ' (' + esc(platform) + ').</p>' +
    '</div></div>' +
    '<div class="grid sm:grid-cols-3 gap-4 mb-8">' +
    compactStatCard(workerText(safeLang, 'ranking', 'Ranking'), formatXpiFromSats(profile.ranking), workerText(safeLang, 'current_profile_ranking', 'Current profile ranking'), 'chart', { valueClass: rankToneClass(profile.ranking) }) +
    compactStatCard(workerText(safeLang, 'votes_plus', 'Votes +'), formatNumber(profile.votesPositive || 0), workerText(safeLang, 'positive_votes', 'Positive votes'), 'up') +
    compactStatCard(workerText(safeLang, 'votes_minus', 'Votes -'), formatNumber(profile.votesNegative || 0), workerText(safeLang, 'negative_votes', 'Negative votes'), 'down') +
    '</div>' +
    '</div>' +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'posts', 'Posts')) + '</h2>' +
    renderTable([workerText(safeLang, 'post_id', 'Post ID'), workerText(safeLang, 'ranking', 'Ranking'), workerText(safeLang, 'vote_ratio', 'Vote Ratio')], postsRows, workerText(safeLang, 'no_posts_yet', 'No posts yet.'), { withPagination: true, lang: safeLang, tableKind: 'posts' }) +
    paginationHtml(localize('/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId)), postsPage, postsPageSize, postsNumPages, {
      pageParam: 'postsPage',
      pageSizeParam: 'postsPageSize',
      groupId: 'posts',
      extraParams: { votesPage: votesPage, votesPageSize: votesPageSize },
      lang: safeLang
    }) +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">' + esc(workerText(safeLang, 'votes', 'Votes')) + '</h2>' +
    renderTable([workerText(safeLang, 'transaction', 'Transaction'), workerText(safeLang, 'timestamp', 'Timestamp'), workerText(safeLang, 'sentiment', 'Sentiment'), workerText(safeLang, 'amount', 'Amount'), workerText(safeLang, 'post_id', 'Post ID')], votesRows, workerText(safeLang, 'no_votes_yet', 'No votes yet.'), { withPagination: true, lang: safeLang, tableKind: 'votes' }) +
    paginationHtml(localize('/social/' + encodeURIComponent(platform) + '/' + encodeURIComponent(profileId)), votesPage, votesPageSize, votesNumPages, {
      pageParam: 'votesPage',
      pageSizeParam: 'votesPageSize',
      groupId: 'votes',
      extraParams: { postsPage: postsPage, postsPageSize: postsPageSize },
      lang: safeLang
    });
  const body = legacyExplorerLayout('profiles', bodyInner, { lang: safeLang });
  return pageShell(canonicalPath, profileTitle, description, body, {
    breadcrumbs,
    keywords,
    ogImage: avatarSrc,
    jsonLd: jsonLd,
    lang: safeLang
  });
}

function errorPage(pathname, message) {
  const body = '<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">Social Unavailable</h1>' +
    '<p class="text-gray-600 dark:text-gray-300 mb-6">Unable to load fresh social data for this route.</p>' +
    '<div class="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">' + esc(message) + '</div>';
  return pageShell(pathname, 'Social Unavailable', 'Unable to load social data.', body);
}

function parseProfilePath(pathname) {
  const m = stripWorkerLangPrefix(pathname).match(/^\/social\/([^/]+)\/([^/]+)\/?$/);
  return m ? { platform: m[1], profileId: m[2] } : null;
}