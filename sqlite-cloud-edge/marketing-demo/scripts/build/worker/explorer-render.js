async function renderExplorerBlocksPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const params = parsePageAndSize(url);
  const payload = await fetchLegacyJson('/api/explorer/blocks', { page: params.page, pageSize: params.pageSize });
  const blocks = payload.blocks || [];
  const tipHeight = num(payload.tipHeight);
  const numPages = tipHeight > 0 ? Math.ceil(tipHeight / params.pageSize) : 1;
  const rows = blocks.map(block => {
    const info = block.blockInfo || {};
    const hash = info.hash || block.hash || '';
    const height = info.height || block.height || 0;
    const burn = num(info.numBurnedSats ?? block.sumBurnedSats ?? 0);
    const txCount = num(info.numTxs ?? block.numTxs ?? (block.txs ? block.txs.length : 0));
    const size = num(info.blockSize ?? block.blockSize ?? block.size ?? 0);
    const timestamp = info.timestamp ?? block.timestamp ?? info.timeFirstSeen ?? block.timeFirstSeen ?? 0;
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(height)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/block/' + encodeURIComponent(hash)) + '">' + esc(shortHash(hash)) + '</a></td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatUtc(timestamp)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(burn)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(txCount)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatBytes(size)) + '</td>' +
      '</tr>';
  });
  const canonical = localize('/explorer/blocks') + '?page=' + params.page + '&pageSize=' + params.pageSize;
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'blocks', 'Blocks'), href: localize('/explorer/blocks') }
  ];
  const title = workerText(safeLang, 'explorer', 'Explorer') + ' - ' + workerText(safeLang, 'blocks', 'Blocks');
  const keywords = workerI18nValue(safeLang, 'seo.explorer_blocks_keywords', [
    'Lotusia',
    workerText(safeLang, 'explorer', 'Explorer'),
    workerText(safeLang, 'blocks', 'Blocks'),
    workerText(safeLang, 'timestamp', 'Timestamp'),
    workerText(safeLang, 'transactions', 'Transactions'),
    workerText(safeLang, 'size', 'Size')
  ].join(', '));
  const description = workerText(safeLang, 'desc_latest_blocks', 'Latest confirmed blocks in the Lotusia blockchain with timestamps, burn totals, transaction counts, and block size metrics.');
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'CollectionPage'),
    seoItemListGraph('Latest blocks', blocks.slice(0, 20).map(function(block) {
      const info = block.blockInfo || {};
      const hash = info.hash || block.hash || '';
      const height = info.height || block.height || 0;
      return {
        name: 'Block #' + String(height),
        url: hash ? seoAbsoluteUrl(localize('/explorer/block/' + encodeURIComponent(hash))) : ''
      };
    }))
  ]);
  const bodyInner = sectionHeader('network', workerText(safeLang, 'blocks', 'Blocks'), workerText(safeLang, 'blocks_subtitle', 'Latest blocks in the blockchain. Refreshed every 5 seconds.')) +
    renderTable([workerText(safeLang, 'height', 'Height'), workerText(safeLang, 'hash', 'Hash'), workerText(safeLang, 'timestamp', 'Timestamp'), workerText(safeLang, 'burned', 'Burned'), workerText(safeLang, 'transactions', 'Transactions'), workerText(safeLang, 'size', 'Size')], rows, workerText(safeLang, 'no_blocks_found', 'No blocks found.'), { withPagination: true, lang: safeLang, tableKind: 'blocks' }) +
    paginationHtml(localize('/explorer/blocks'), params.page, params.pageSize, numPages, { lang: safeLang });
  const body = legacyExplorerLayout('blocks', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderExplorerOverviewPage(lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const [overview, chainInfo, mempool] = await Promise.all([
    fetchLegacyJson('/api/explorer/overview'),
    fetchLegacyJson('/api/explorer/chain-info').catch(() => ({})),
    fetchLegacyJson('/api/explorer/mempool').catch(() => [])
  ]);
  const mining = overview.mininginfo || {};
  const peers = overview.peerinfo || [];
  const peerRows = await Promise.all(peers.slice(0, 15).map(async function(p) {
    const addr = p.addr || '-';
    const version = p.subver || '-';
    const blocks = p.synced_headers ?? p.synced_blocks ?? '-';
    const fromApiCode = p.geoip && (p.geoip.countryCode || p.geoip.country_code);
    const fromApiName = p.geoip && (p.geoip.country || p.geoip.countryName);
    const geo = fromApiCode
      ? { countryCode: String(fromApiCode).toUpperCase(), countryName: String(fromApiName || '') }
      : await lookupGeoIp(addr);
    const code = geo.countryCode || '';
    const name = geo.countryName || '';
    const flag = countryFlagEmoji(code);
    const label = name || (code ? code : 'Unknown country');
    const countryCell = code
      ? '<span class="inline-flex items-center gap-2" title="' + esc(label) + '" aria-label="' + esc(label) + '"><span class="text-base leading-none" aria-hidden="true">' + esc(flag || '') + '</span><span>' + esc(code) + '</span></span>'
      : '<span class="text-gray-500 dark:text-gray-400" title="Unknown country" aria-label="Unknown country">-</span>';
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + countryCell + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(addr) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(version) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(blocks)) + '</td>' +
      '</tr>';
  }));
  const tip = num(chainInfo.tipHeight || chainInfo.blocks || 0);
  const pending = Array.isArray(mempool) ? mempool.length : 0;
  const hashrate = num(mining.networkhashps || 0);
  const hashrateText = hashrate > 0 ? formatNumber(hashrate / 1e9, safeLang) + ' GH/s' : '-';
  const diffText = num(mining.difficulty || 0) > 0 ? formatNumber(num(mining.difficulty), safeLang) : '-';
  const blockTime = num(mining.target || 0) > 0 ? formatNumber(num(mining.target) / 60, safeLang) + ' minutes' : '-';
  const cards = '<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">' +
    compactStatCard(workerText(safeLang, 'connections', 'Connections'), formatNumber(peers.length), workerText(safeLang, 'connections_hint', 'Number of Lotus nodes connected to the Explorer'), 'connections') +
    compactStatCard(workerText(safeLang, 'blocks', 'Blocks'), formatNumber(tip), workerText(safeLang, 'blocks_hint', 'Total number of blocks in the blockchain'), 'cube') +
    compactStatCard(workerText(safeLang, 'pending_transactions', 'Pending Transactions'), formatNumber(pending), workerText(safeLang, 'pending_transactions_hint', 'Transactions waiting to be confirmed'), 'clock') +
    compactStatCard(workerText(safeLang, 'hashrate', 'Hashrate'), hashrateText, workerText(safeLang, 'hashrate_hint', 'Estimated hashes computed per second'), 'bolt') +
    compactStatCard(workerText(safeLang, 'difficulty', 'Difficulty'), diffText, workerText(safeLang, 'difficulty_hint', 'Difficulty of the most recent block'), 'gauge') +
    compactStatCard(workerText(safeLang, 'avg_block_time', 'Avg. Block Time'), blockTime, workerText(safeLang, 'avg_block_time_hint', 'Calculated from latest chain target'), 'clock') +
    '</div>';
  const mainnetBadge = '<span class="inline-flex shrink-0 items-center rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400">' + esc(workerText(safeLang, 'mainnet', 'Mainnet')) + '</span>';
  const canonical = localize('/explorer');
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') }
  ];
  const title = workerText(safeLang, 'explorer', 'Explorer') + ' - ' + workerText(safeLang, 'overview', 'Overview');
  const keywords = workerI18nValue(safeLang, 'seo.explorer_overview_keywords', [
    'Lotusia',
    workerText(safeLang, 'explorer', 'Explorer'),
    workerText(safeLang, 'overview', 'Overview'),
    workerText(safeLang, 'hashrate', 'Hashrate'),
    workerText(safeLang, 'difficulty', 'Difficulty'),
    workerText(safeLang, 'connections', 'Connections')
  ].join(', '));
  const description = workerText(safeLang, 'desc_network_overview', 'Network overview for the Lotusia explorer covering peers, hashrate, difficulty, pending transactions, and chain health metrics.');
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'WebPage')
  ]);
  const bodyInner = sectionHeader('network', workerText(safeLang, 'network', 'Network'), workerText(safeLang, 'network_subtitle', 'Up-to-date information about the Lotusia blockchain network.'), mainnetBadge) +
    cards +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'peer_info', 'Peer Info')) + '</h2>' +
    '<p class="text-gray-600 dark:text-gray-300 mb-4">' + esc(workerText(safeLang, 'peer_info_hint', 'List of Lotus nodes connected to the Explorer.')) + '</p>' +
    renderTable([workerText(safeLang, 'country', 'Country'), workerText(safeLang, 'address', 'Address'), workerText(safeLang, 'version', 'Version'), workerText(safeLang, 'blocks', 'Blocks')], peerRows, workerText(safeLang, 'no_peer_data', 'No peer data available.'), { lang: safeLang, tableKind: 'peers' });
  const body = legacyExplorerLayout('overview', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderExplorerBlockDetailPage(url, hashOrHeight, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.explorer_blocks_keywords', [
    'Lotusia',
    workerText(safeLang, 'block_details', 'Block Details'),
    workerText(safeLang, 'transactions', 'Transactions'),
    workerText(safeLang, 'block_subsidy', 'Block Subsidy'),
    workerText(safeLang, 'size', 'Size'),
    workerText(safeLang, 'burned', 'Burned')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const payload = await fetchLegacyJson('/api/explorer/block/' + encodeURIComponent(hashOrHeight));
  const info = payload.blockInfo || {};
  const txs = payload.txs || [];
  const rows = txs.map(tx => {
    const burn = tx.sumBurnedSats || 0;
    const isCoinbase = Boolean(tx.isCoinbase || tx.coinbase || tx.is_coinbase);
    const coinbaseBadge = isCoinbase
      ? '<span class="inline-flex items-center rounded-md border border-green-500/30 bg-green-500/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400" style="margin-left:.625rem;">Coinbase</span>'
      : '';
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/tx/' + encodeURIComponent(tx.txid)) + '">' + esc(shortHash(tx.txid)) + '</a>' + coinbaseBadge + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatUtc(tx.timeFirstSeen || info.timestamp)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(burn)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber((tx.inputs || []).length)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber((tx.outputs || []).length)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatBytes(tx.size)) + '</td>' +
      '</tr>';
  });
  const canonical = localize('/explorer/block/' + encodeURIComponent(hashOrHeight));
  const blockLabel = '#' + String(info.height || hashOrHeight);
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'blocks', 'Blocks'), href: localize('/explorer/blocks') },
    { label: blockLabel, href: canonical }
  ];
  const title = 'Block ' + (info.hash || hashOrHeight);
  const description = 'Detailed information about a Lotusia block.';
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'WebPage')
  ]);
  const mainnetBadge = '<span class="inline-flex shrink-0 items-center rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400">' + esc(workerText(safeLang, 'mainnet', 'Mainnet')) + '</span>';
  const minedByAddress = String(payload.minedBy || '').trim();
  const minedByValue = minedByAddress
    ? middleEllipsis(minedByAddress, 14, 12)
    : '-';
  const minedByHint = minedByAddress
    ? '<a href="' + localize('/explorer/address/' + encodeURIComponent(minedByAddress)) + '" title="' + esc(minedByAddress) + '" class="block max-w-full truncate text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300">' + esc(middleEllipsis(minedByAddress, 12, 10)) + '</a>'
    : 'Miner address';
  const bodyInner = sectionHeader('cube', workerText(safeLang, 'block_details', 'Block Details'), workerText(safeLang, 'block_details_subtitle', 'Detailed block metrics and transactions.'), mainnetBadge) +
    '<p class="text-sm text-gray-500 mb-6"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/blocks') + '">#' + esc(formatNumber(info.height || hashOrHeight)) + '</a> · ' + esc(shortHash(info.hash || hashOrHeight)) + '</p>' +
    '<div class="grid sm:grid-cols-3 gap-4 mb-8">' +
    compactStatCard('Timestamp', formatUtc(info.timestamp), 'UTC', 'clock') +
    compactStatCard('Block Subsidy', formatXpiFromSats(info.reward || 0), 'New coins minted', 'coins') +
    compactStatCard('Mined By', minedByValue, minedByHint, 'profile', { valueClass: 'text-lg md:text-xl leading-tight truncate max-w-full block', hintClass: 'truncate max-w-full', hintHtml: true }) +
    compactStatCard('Block Size', formatBytes(info.blockSize), 'Serialized bytes', 'weight') +
    compactStatCard('Transactions', formatNumber(info.numTxs || txs.length), 'Transactions in this block', 'txs') +
    compactStatCard('Burned', formatXpiFromSats(info.numBurnedSats || 0), 'Total burned in block', 'flame') +
    '</div>' +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'transactions', 'Transactions')) + '</h2>' +
    renderTable([workerText(safeLang, 'tx_id', 'Transaction ID'), workerText(safeLang, 'first_seen', 'First Seen'), workerText(safeLang, 'burned', 'Burned'), workerText(safeLang, 'inputs', 'Inputs'), workerText(safeLang, 'outputs', 'Outputs'), workerText(safeLang, 'size', 'Size')], rows, workerText(safeLang, 'no_transactions_in_block', 'No transactions in this block.'), { lang: safeLang, tableKind: 'blocktxs' });
  const body = legacyExplorerLayout('blocks', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderExplorerTxDetailPage(url, txid, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.explorer_blocks_keywords', [
    'Lotusia',
    workerText(safeLang, 'transaction_details', 'Transaction Details'),
    workerText(safeLang, 'inputs', 'Inputs'),
    workerText(safeLang, 'outputs', 'Outputs'),
    workerText(safeLang, 'confirmed', 'Confirmed')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const payload = await fetchLegacyJson('/api/explorer/tx/' + encodeURIComponent(txid));
  const block = payload.block || {};
  const inputs = payload.inputs || [];
  const outputs = payload.outputs || [];
  const inputsRows = inputs.map(function(input, idx) {
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(workerText(safeLang, 'input', 'Input')) + ' #' + (idx + 1) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(input.address || (input.isCoinbase ? 'Coinbase' : '-')) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(input.value || 0)) + '</td>' +
      '</tr>';
  });
  const outputsRows = outputs.map(function(output, idx) {
    const target = output.address
      ? '<a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 break-all" href="' + localize('/explorer/address/' + encodeURIComponent(output.address)) + '">' + esc(output.address) + '</a>'
      : (output.rankOutput ? 'RANK script output' : '-');
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(workerText(safeLang, 'output', 'Output')) + ' #' + (idx + 1) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + target + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(output.value || 0)) + '</td>' +
      '</tr>';
  });
  const canonical = localize('/explorer/tx/' + encodeURIComponent(txid));
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'transaction', 'Transaction'), href: canonical }
  ];
  const title = 'Transaction ' + txid;
  const description = 'Detailed information about a Lotusia transaction.';
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'WebPage')
  ]);
  const statusBadge = '<span class="inline-flex items-center gap-2">' +
    '<span class="inline-flex shrink-0 items-center rounded-md border border-green-500/30 bg-green-500/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400">' + esc(workerText(safeLang, 'confirmed', 'Confirmed')) + '</span>' +
    (payload.isCoinbase
      ? '<span class="inline-flex shrink-0 items-center rounded-md border border-green-500/30 bg-green-500/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-green-400">' + esc(workerText(safeLang, 'coinbase', 'Coinbase')) + '</span>'
      : '') +
    '</span>';
  const bodyInner = sectionHeader('chart', workerText(safeLang, 'transaction_details', 'Transaction Details'), workerText(safeLang, 'transaction_details_subtitle', 'Inputs, outputs, and block confirmation details.'), statusBadge) +
    '<p class="text-sm text-gray-500 mb-6">' + esc(shortHash(payload.txid || txid)) + '</p>' +
    '<div class="grid sm:grid-cols-3 gap-4 mb-8">' +
    compactStatCard('Time First Seen', formatUtc(payload.timeFirstSeen), 'When this tx first appeared', 'chart') +
    compactStatCard('Size', formatBytes(payload.size), 'Raw transaction size', 'network') +
    compactStatCard('Confirmations', formatNumber(payload.confirmations || 0), 'Current block confirmations', 'up') +
    '</div>' +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'block_information', 'Block Information')) + '</h2>' +
    '<div class="grid sm:grid-cols-3 gap-4 mb-8">' +
    compactStatCard('Transaction Confirmed', formatUtc(block.timestamp), 'Confirmation timestamp', 'up') +
    compactStatCard('Confirmations', formatNumber(payload.confirmations || 0), 'Network confirmations', 'up') +
    compactStatCard('Confirmed in Block', shortHash(block.hash || ''), 'View full block details', 'network') +
    '</div>' +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'inputs', 'Inputs')) + '</h2>' +
    renderTable([workerText(safeLang, 'input', 'Input'), workerText(safeLang, 'source', 'Source'), workerText(safeLang, 'amount', 'Amount')], inputsRows, workerText(safeLang, 'no_inputs', 'No inputs.'), { lang: safeLang, tableKind: 'inputs' }) +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">' + esc(workerText(safeLang, 'outputs', 'Outputs')) + '</h2>' +
    renderTable([workerText(safeLang, 'output', 'Output'), workerText(safeLang, 'destination', 'Destination'), workerText(safeLang, 'amount', 'Amount')], outputsRows, workerText(safeLang, 'no_outputs', 'No outputs.'), { lang: safeLang, tableKind: 'outputs' });
  const body = legacyExplorerLayout('blocks', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

async function renderExplorerAddressDetailPage(url, address, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const keywords = workerI18nValue(safeLang, 'seo.explorer_blocks_keywords', [
    'Lotusia',
    workerText(safeLang, 'address_details', 'Address Details'),
    workerText(safeLang, 'balance', 'Balance'),
    workerText(safeLang, 'transaction_history', 'Transaction History'),
    workerText(safeLang, 'transactions', 'Transactions')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const params = parsePageAndSize(url);
  const [details, balance] = await Promise.all([
    fetchLegacyJson('/api/explorer/address/' + encodeURIComponent(address), { page: params.page, pageSize: params.pageSize }),
    fetchLegacyJson('/api/explorer/address/' + encodeURIComponent(address) + '/balance')
  ]);
  const txs = (details.history && details.history.txs) || [];
  const numPages = (details.history && details.history.numPages) || 1;
  const rows = txs.map(tx => {
    const burn = tx.sumBurnedSats || 0;
    return '<tr>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/tx/' + encodeURIComponent(tx.txid)) + '">' + esc(shortHash(tx.txid)) + '</a></td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatUtc((tx.block && tx.block.timestamp) || tx.timeFirstSeen)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(burn)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber((tx.inputs || []).length)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber((tx.outputs || []).length)) + '</td>' +
      '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatBytes(tx.size)) + '</td>' +
      '</tr>';
  });
  const canonical = localize('/explorer/address/' + encodeURIComponent(address)) + '?page=' + params.page + '&pageSize=' + params.pageSize;
  const canonicalBase = localize('/explorer/address/' + encodeURIComponent(address));
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'address', 'Address'), href: canonicalBase }
  ];
  const title = 'Address ' + address;
  const description = 'Detailed information for a Lotusia address.';
  const jsonLd = seoJsonLd([
    seoBreadcrumbGraph(breadcrumbs),
    seoPageGraph(canonical, title, description, 'CollectionPage')
  ]);
  const bodyInner = sectionHeader('profile', workerText(safeLang, 'address_details', 'Address Details'), workerText(safeLang, 'address_details_subtitle', 'Address balance and transaction history on Lotusia mainnet.')) +
    '<p class="text-sm text-gray-500 mb-6 break-all">' + esc(address) + '</p>' +
    '<div class="grid sm:grid-cols-2 gap-4 mb-8">' +
    compactStatCard(workerText(safeLang, 'balance', 'Balance'), formatXpiFromSats(balance), workerText(safeLang, 'current_wallet_balance', 'Current wallet balance'), 'up') +
    compactStatCard(workerText(safeLang, 'last_seen', 'Last Seen'), formatUtc(details.lastSeen), workerText(safeLang, 'last_activity_timestamp', 'Last activity timestamp'), 'chart') +
    '</div>' +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'transaction_history', 'Transaction History')) + '</h2>' +
    renderTable([workerText(safeLang, 'tx_id', 'Transaction ID'), workerText(safeLang, 'first_seen', 'First Seen'), workerText(safeLang, 'burned', 'Burned'), workerText(safeLang, 'inputs', 'Inputs'), workerText(safeLang, 'outputs', 'Outputs'), workerText(safeLang, 'size', 'Size')], rows, workerText(safeLang, 'no_transactions_for_address', 'No transactions for this address.'), { withPagination: true, lang: safeLang, tableKind: 'blocktxs' }) +
    paginationHtml(localize('/explorer/address/' + encodeURIComponent(address)), params.page, params.pageSize, numPages, { lang: safeLang });
  const body = legacyExplorerLayout('blocks', bodyInner, { lang: safeLang });
  return pageShell(canonical, title, description, body, {
    breadcrumbs,
    keywords,
    jsonLd,
    lang: safeLang
  });
}

function safeInlineJson(value) {
  return JSON.stringify(value || []).replace(/</g, '\\u003c');
}

function d3Styles() {
  return '<style>' +
    '.d3-card{position:relative;border-radius:1rem;border:1px solid rgba(148,163,184,.25);background:linear-gradient(160deg,rgba(15,23,42,.04),rgba(79,70,229,.08));padding:1rem;overflow:hidden}' +
    '.dark .d3-card{border-color:rgba(148,163,184,.22);background:linear-gradient(160deg,rgba(2,6,23,.65),rgba(30,41,59,.5))}' +
    '.d3-title{font-size:.9rem;font-weight:700;color:#334155;margin-bottom:.5rem}' +
    '.dark .d3-title{color:#e2e8f0}' +
    '.d3-axis text{font-size:11px;fill:#64748b}' +
    '.dark .d3-axis text{fill:#94a3b8}' +
    '.d3-axis path,.d3-axis line{stroke:#cbd5e1;opacity:.7}' +
    '.dark .d3-axis path,.dark .d3-axis line{stroke:#334155}' +
    '.d3-grid line{stroke:#cbd5e1;stroke-opacity:.35}' +
    '.dark .d3-grid line{stroke:#334155;stroke-opacity:.45}' +
    '.d3-tooltip{position:absolute;pointer-events:none;background:rgba(15,23,42,.92);color:#f8fafc;padding:.4rem .55rem;border-radius:.5rem;font-size:.75rem;border:1px solid rgba(148,163,184,.4);transform:translate(-50%,-120%);white-space:nowrap}' +
    '.d3-legend{display:flex;flex-wrap:wrap;gap:.5rem .9rem;font-size:.75rem;color:#64748b;margin-top:.35rem}' +
    '.dark .d3-legend{color:#94a3b8}' +
    '.d3-legend-dot{width:.6rem;height:.6rem;border-radius:9999px;display:inline-block;margin-right:.35rem;vertical-align:middle}' +
    '</style>';
}

function d3LineChartScript(chartId, series, defs, lang) {
  const locale = String(workerI18nValue(WORKER_LANGS.includes(lang) ? lang : 'en', 'locale', 'en_US') || 'en_US').replace(/_/g, '-');
  return '<script src="/assets/vendor/d3/d3.min.js"></script>' +
    '<script>(function(){' +
    'var root=document.getElementById(' + JSON.stringify(chartId) + ');if(!root||!window.d3)return;' +
    'var series=' + safeInlineJson(series) + ';var defs=' + safeInlineJson(defs) + ';' +
    'if(!Array.isArray(series))series=[];' +
    'if(!series.length){var now=Math.floor(Date.now()/1000);for(var z=0;z<24;z++){var row={ts:now-(23-z)*300};for(var k=0;k<defs.length;k++){row[defs[k].key]=0;}series.push(row);} }' +
    'var d3=window.d3;var m={t:12,r:18,b:30,l:48};var w=Math.max(420,root.clientWidth||760);var h=220;var iw=w-m.l-m.r;var ih=h-m.t-m.b;' +
    'var svg=d3.select(root).append(\"svg\").attr(\"viewBox\",\"0 0 \"+w+\" \"+h).attr(\"class\",\"w-full h-[220px]\");' +
    'var g=svg.append(\"g\").attr(\"transform\",\"translate(\"+m.l+\",\"+m.t+\")\");' +
    'var x=d3.scaleLinear().domain([0,series.length-1]).range([0,iw]);' +
    'var all=[];defs.forEach(function(def){for(var i=0;i<series.length;i++){all.push(Number(series[i][def.key]||0));}});' +
    'var y=d3.scaleLinear().domain([Math.min.apply(null,all)*0.96,Math.max.apply(null,all)*1.04]).nice().range([ih,0]);' +
    'g.append(\"g\").attr(\"class\",\"d3-grid\").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(\"\"));' +
    'defs.forEach(function(def){var line=d3.line().x(function(d,i){return x(i);}).y(function(d){return y(Number(d[def.key]||0));}).curve(d3.curveMonotoneX);' +
    'g.append(\"path\").datum(series).attr(\"fill\",\"none\").attr(\"stroke\",def.color).attr(\"stroke-width\",2.5).attr(\"d\",line);});' +
    'var xticks=[0,Math.floor((series.length-1)/2),series.length-1].filter(function(v,i,a){return a.indexOf(v)===i;});' +
    'g.append(\"g\").attr(\"class\",\"d3-axis\").attr(\"transform\",\"translate(0,\"+ih+\")\").call(d3.axisBottom(x).tickValues(xticks).tickFormat(function(i){var p=series[i]||{};var d=new Date((Number(p.ts)||0)*1000);if(Number.isNaN(d.getTime()))return String(i);return d.toISOString().slice(5,16).replace(\"T\",\" \");}));' +
    'g.append(\"g\").attr(\"class\",\"d3-axis\").call(d3.axisLeft(y).ticks(5));' +
    'var focus=g.append(\"g\").style(\"display\",\"none\");focus.append(\"line\").attr(\"y1\",0).attr(\"y2\",ih).attr(\"stroke\",\"#94a3b8\").attr(\"stroke-dasharray\",\"3 3\");' +
    'defs.forEach(function(def){focus.append(\"circle\").attr(\"r\",4).attr(\"fill\",def.color).attr(\"data-dot\",def.key);});' +
    'var tip=d3.select(root).append(\"div\").attr(\"class\",\"d3-tooltip\").style(\"display\",\"none\");' +
    'svg.append(\"rect\").attr(\"transform\",\"translate(\"+m.l+\",\"+m.t+\")\").attr(\"width\",iw).attr(\"height\",ih).attr(\"fill\",\"transparent\")' +
    '.on(\"mouseenter\",function(){focus.style(\"display\",null);tip.style(\"display\",null);})' +
    '.on(\"mouseleave\",function(){focus.style(\"display\",\"none\");tip.style(\"display\",\"none\");})' +
    '.on(\"mousemove\",function(ev){var p=d3.pointer(ev,this);var idx=Math.max(0,Math.min(series.length-1,Math.round(x.invert(p[0]))));var row=series[idx]||{};var xx=x(idx);focus.select(\"line\").attr(\"transform\",\"translate(\"+xx+\",0)\");defs.forEach(function(def){focus.select(\"circle[data-dot=\\\"\"+def.key+\"\\\"]\").attr(\"cx\",xx).attr(\"cy\",y(Number(row[def.key]||0)));});' +
    'var dt=new Date((Number(row.ts)||0)*1000);var label=(Number.isNaN(dt.getTime())?\"n/a\":dt.toISOString().slice(0,16).replace(\"T\",\" \"))+\" UTC\";' +
    'var values=defs.map(function(def){return \"<div><span style=\\\"color:\"+def.color+\"\\\">●</span> \"+def.label+\": \"+Number(row[def.key]||0).toLocaleString(' + JSON.stringify(locale) + ')+\"</div>\";}).join(\"\");' +
    'tip.html(\"<div style=\\\"font-weight:700;margin-bottom:.25rem\\\">\"+label+\"</div>\"+values).style(\"left\",(m.l+xx)+\"px\").style(\"top\",(m.t+y(Number(row[defs[0].key]||0)))+\"px\");});' +
    'var legend=d3.select(root).append(\"div\").attr(\"class\",\"d3-legend\");defs.forEach(function(def){legend.append(\"div\").html(\"<span class=\\\"d3-legend-dot\\\" style=\\\"background:\"+def.color+\"\\\"></span>\"+def.label);});' +
    'var nonZero=all.some(function(v){return Number(v)!==0;});if(!nonZero){d3.select(root).append(\"p\").attr(\"class\",\"text-xs text-gray-500 dark:text-gray-400 mt-2\").text(\"Awaiting indexed metrics for this period.\");}' +
    '})();</script>';
}

function d3RichlistScript(balanceRows, wealthBuckets, lang) {
  const locale = String(workerI18nValue(WORKER_LANGS.includes(lang) ? lang : 'en', 'locale', 'en_US') || 'en_US').replace(/_/g, '-');
  return '<script src="/assets/vendor/d3/d3.min.js"></script>' +
    '<script>(function(){' +
    'if(!window.d3)return;var d3=window.d3;' +
    'var bars=' + safeInlineJson(balanceRows || []) + ';var wealth=' + safeInlineJson(wealthBuckets || []) + ';' +
    'var barsRoot=document.getElementById(\"richlist-bars\");' +
    'if(barsRoot){var data=bars.slice(0,20);if(!data.length){for(var bi=1;bi<=12;bi++){data.push({rank:bi,balanceXpi:0});}}{' +
    'var m={t:10,r:12,b:28,l:58},w=Math.max(420,barsRoot.clientWidth||780),h=300,iw=w-m.l-m.r,ih=h-m.t-m.b;' +
    'var svg=d3.select(barsRoot).append(\"svg\").attr(\"viewBox\",\"0 0 \"+w+\" \"+h).attr(\"class\",\"w-full h-[300px]\");' +
    'var g=svg.append(\"g\").attr(\"transform\",\"translate(\"+m.l+\",\"+m.t+\")\");' +
    'var x=d3.scaleBand().domain(data.map(function(d){return String(d.rank);})).range([0,iw]).padding(.15);' +
    'var y=d3.scaleLinear().domain([0,d3.max(data,function(d){return Number(d.balanceXpi||0);})||1]).nice().range([ih,0]);' +
    'g.append(\"g\").attr(\"class\",\"d3-grid\").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(\"\"));' +
    'g.selectAll(\"rect.bar\").data(data).enter().append(\"rect\").attr(\"class\",\"bar\").attr(\"x\",function(d){return x(String(d.rank));}).attr(\"y\",function(d){return y(Number(d.balanceXpi||0));}).attr(\"width\",x.bandwidth()).attr(\"height\",function(d){return ih-y(Number(d.balanceXpi||0));}).attr(\"rx\",6).attr(\"fill\",function(d){return Number(d.balanceXpi||0)>0?\"#6366f1\":\"#94a3b8\";}).attr(\"opacity\",function(d){return Number(d.balanceXpi||0)>0?1:.35;});' +
    'g.append(\"g\").attr(\"class\",\"d3-axis\").attr(\"transform\",\"translate(0,\"+ih+\")\").call(d3.axisBottom(x).tickValues(x.domain().filter(function(_,i){return i%2===0;})));' +
    'g.append(\"g\").attr(\"class\",\"d3-axis\").call(d3.axisLeft(y).ticks(5));' +
    'if(!bars.length){d3.select(barsRoot).append(\"p\").attr(\"class\",\"text-xs text-gray-500 dark:text-gray-400 mt-2\").text(\"Awaiting indexed richlist balance data.\");}' +
    '}' +
    '}' +
    'var donutRoot=document.getElementById(\"richlist-wealth-donut\");' +
    'if(donutRoot){if(!wealth.length){wealth=[{label:\"Pending\",totalSats:1,pct:100}];}' +
    'var w=320,h=320,r=Math.min(w,h)/2-10;var svg=d3.select(donutRoot).append(\"svg\").attr(\"viewBox\",\"0 0 \"+w+\" \"+h).attr(\"class\",\"w-full max-w-[320px] h-auto mx-auto\");var g=svg.append(\"g\").attr(\"transform\",\"translate(\"+(w/2)+\",\"+(h/2)+\")\");' +
    'var color=d3.scaleOrdinal().domain(wealth.map(function(d){return d.label;})).range([\"#6366f1\",\"#8b5cf6\",\"#06b6d4\",\"#10b981\",\"#f59e0b\",\"#ef4444\"]);' +
    'var pie=d3.pie().sort(null).value(function(d){return Number(d.totalSats||0);});var arc=d3.arc().innerRadius(r*.58).outerRadius(r);' +
    'g.selectAll(\"path\").data(pie(wealth)).enter().append(\"path\").attr(\"d\",arc).attr(\"fill\",function(d){return color(d.data.label);}).attr(\"stroke\",\"#0f172a\").attr(\"stroke-width\",1);' +
    'var legend=d3.select(donutRoot).append(\"div\").attr(\"class\",\"d3-legend justify-center mt-3\");wealth.forEach(function(d){legend.append(\"div\").html(\"<span class=\\\"d3-legend-dot\\\" style=\\\"background:\"+color(d.label)+\"\\\"></span>\"+d.label+\" (\"+Number(d.pct||0).toLocaleString(' + JSON.stringify(locale) + ',{minimumFractionDigits:2,maximumFractionDigits:2})+\"%)\");});' +
    'if(wealth.length===1&&wealth[0].label===\"Pending\"){d3.select(donutRoot).append(\"p\").attr(\"class\",\"text-xs text-gray-500 dark:text-gray-400 mt-2 text-center\").text(\"Awaiting indexed wealth buckets.\");}' +
    '}' +
    '})();</script>';
}

async function renderExplorerStatsPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const period = String(url.searchParams.get('period') || 'day');
  const [cards, charts] = await Promise.all([
    fetchLegacyJson('/api/explorer/stats/cards'),
    fetchLegacyJson('/api/explorer/stats/charts', { period })
  ]);
  const series = Array.isArray(charts?.series) ? charts.series : [];
  const periodOptions = ['day', 'week', 'month', 'quarter', 'year'].map(function(p) {
    const active = p === period;
    const cls = active
      ? 'inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-primary-500 text-white'
      : 'inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200';
    return '<a href="' + localize('/explorer/stats') + '?period=' + p + '" class="' + cls + '">' + esc(p) + '</a>';
  }).join('');
  const canonical = localize('/explorer/stats');
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'stats', 'Stats'), href: canonical }
  ];
  const bodyInner = sectionHeader('chart', workerText(safeLang, 'stats', 'Stats'), workerText(safeLang, 'stats_subtitle', 'Chain performance and monetary metrics snapshots.')) +
    d3Styles() +
    '<div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">' +
    compactStatCard('Tip Height', formatNumber(cards?.tipHeight || 0), 'Latest indexed block', 'cube') +
    compactStatCard('Hashrate', formatNumber(cards?.hashrate || 0), 'Current estimated network rate', 'bolt') +
    compactStatCard('Difficulty', formatNumber(cards?.difficulty || 0), 'Current mining difficulty', 'gauge') +
    compactStatCard('Inflation', formatPercent(cards?.inflationPct || 0, 2, safeLang), 'Estimated daily inflation basis', 'up') +
    compactStatCard('Mempool', formatNumber(cards?.mempoolCount || 0), 'Pending transaction count', 'clock') +
    compactStatCard('Mempool Size', formatBytes(cards?.mempoolBytes || 0), 'Pending serialized bytes', 'weight') +
    compactStatCard('Total Supply', formatXpiFromSats(cards?.totalSupplySats || 0), 'Cumulative issued minus burns', 'coins') +
    compactStatCard('Burned Supply', formatXpiFromSats(cards?.burnedSupplySats || 0), 'Cumulative burned amount', 'flame') +
    '</div>' +
    '<div class="mb-4 flex flex-wrap gap-2">' + periodOptions + '</div>' +
    '<div class="d3-card mb-5"><div class="d3-title">Hashrate, Difficulty, and Mempool Trend</div><div id="stats-trend-chart"></div></div>' +
    d3LineChartScript('stats-trend-chart', series, [
      { key: 'hashrate', label: 'Hashrate', color: '#6366f1' },
      { key: 'difficulty', label: 'Difficulty', color: '#06b6d4' },
      { key: 'mempoolCount', label: 'Mempool TX', color: '#f59e0b' }
    ], safeLang);
  const body = legacyExplorerLayout('stats', bodyInner, { lang: safeLang });
  return pageShell(canonical, 'Explorer Stats', 'Lotusia chain statistics and charts.', body, {
    breadcrumbs,
    lang: safeLang
  });
}

async function renderExplorerRichlistPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const [balance, received, wealth] = await Promise.all([
    fetchLegacyJson('/api/explorer/richlist/balance', { page: 1, pageSize: 100 }),
    fetchLegacyJson('/api/explorer/richlist/received', { page: 1, pageSize: 100 }),
    fetchLegacyJson('/api/explorer/richlist/wealth')
  ]);
  const balanceRows = (balance?.rows || []).map((r) =>
    '<tr><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(r.rank)) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/address/' + encodeURIComponent(r.address)) + '">' + esc(middleEllipsis(r.address, 14, 12)) + '</a></td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(r.balanceSats)) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatPercent(r.pct || 0, 4, safeLang)) + '</td></tr>'
  );
  const receivedRows = (received?.rows || []).map((r) =>
    '<tr><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(r.rank)) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/address/' + encodeURIComponent(r.address)) + '">' + esc(middleEllipsis(r.address, 14, 12)) + '</a></td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(r.receivedSats)) + '</td></tr>'
  );
  const wealthRows = (wealth?.buckets || []).map((b) =>
    '<tr><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 text-gray-500 dark:text-gray-400">' + esc(b.label) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(b.count)) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatXpiFromSats(b.totalSats)) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatPercent(b.pct || 0, 4, safeLang)) + '</td></tr>'
  );
  const canonical = localize('/explorer/richlist');
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'richlist', 'Richlist'), href: canonical }
  ];
  const bodyInner = sectionHeader('coins', workerText(safeLang, 'richlist', 'Richlist'), workerText(safeLang, 'richlist_subtitle', 'Top holders, top receivers, and distribution tiers.')) +
    d3Styles() +
    '<div class="grid xl:grid-cols-[1.65fr_1fr] gap-4 mb-5">' +
    '<div class="d3-card"><div class="d3-title">Top Balances (Top 20)</div><div id="richlist-bars"></div></div>' +
    '<div class="d3-card"><div class="d3-title">Wealth Distribution</div><div id="richlist-wealth-donut"></div></div>' +
    '</div>' +
    d3RichlistScript(balance?.rows || [], wealth?.buckets || [], safeLang) +
    renderTable(['Rank', 'Address', 'Balance', 'Share'], balanceRows, 'No richlist balance data.', { lang: safeLang, tableKind: 'richlist-balance' }) +
    '<div class="h-5"></div>' +
    renderTable(['Rank', 'Address', 'Received'], receivedRows, 'No richlist received data.', { lang: safeLang, tableKind: 'richlist-received' }) +
    '<div class="h-5"></div>' +
    renderTable(['Tier', 'Holders', 'Balance', 'Share'], wealthRows, 'No wealth distribution data.', { lang: safeLang, tableKind: 'richlist-wealth' });
  const body = legacyExplorerLayout('richlist', bodyInner, { lang: safeLang });
  return pageShell(canonical, 'Explorer Richlist', 'Lotusia richlist and wealth distribution.', body, {
    breadcrumbs,
    lang: safeLang
  });
}

async function renderExplorerNetworkPage(lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const [peers, nodes] = await Promise.all([
    fetchLegacyJson('/api/explorer/network/peers'),
    fetchLegacyJson('/api/explorer/network/nodes')
  ]);
  const peerRows = (peers?.peers || []).map((p) =>
    '<tr><td class="whitespace-nowrap px-4 py-4 text-sm leading-6 text-gray-500 dark:text-gray-400">' + esc(p.countryCode || '-') + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 text-gray-500 dark:text-gray-400">' + esc(p.address || '-') + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 text-gray-500 dark:text-gray-400">' + esc(p.subver || '-') + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatNumber(p.syncedBlocks || 0)) + '</td></tr>'
  );
  const addnodeRows = (nodes?.addnode || []).slice(0, 50).map((line) =>
    '<tr><td class="px-4 py-4 text-sm leading-6 text-gray-500 dark:text-gray-400 break-all">' + esc(line) + '</td></tr>'
  );
  const onetryRows = (nodes?.onetry || []).slice(0, 50).map((line) =>
    '<tr><td class="px-4 py-4 text-sm leading-6 text-gray-500 dark:text-gray-400 break-all">' + esc(line) + '</td></tr>'
  );
  const canonical = localize('/explorer/network');
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'network', 'Network'), href: canonical }
  ];
  const bodyInner = sectionHeader('network', workerText(safeLang, 'network', 'Network'), workerText(safeLang, 'network_subtitle', 'Peer topology and node line exports.')) +
    renderTable(['Country', 'Address', 'Version', 'Blocks'], peerRows, 'No peer data.', { lang: safeLang, tableKind: 'peers' }) +
    '<div class="h-5"></div>' +
    renderTable(['Addnode lines'], addnodeRows, 'No addnode lines.', { lang: safeLang, hideCue: true }) +
    '<div class="h-5"></div>' +
    renderTable(['Onetry lines'], onetryRows, 'No onetry lines.', { lang: safeLang, hideCue: true });
  const body = legacyExplorerLayout('network', bodyInner, { lang: safeLang });
  return pageShell(canonical, 'Explorer Network', 'Lotusia network peers and node lines.', body, {
    breadcrumbs,
    lang: safeLang
  });
}

async function renderExplorerMempoolPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  setWorkerFormatLang(safeLang);
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const params = parsePageAndSize(url);
  const period = String(url.searchParams.get('period') || 'day');
  const [stats, history, list] = await Promise.all([
    fetchLegacyJson('/api/explorer/mempool/stats'),
    fetchLegacyJson('/api/explorer/mempool/history', { period }),
    fetchLegacyJson('/api/explorer/mempool', { page: params.page, pageSize: params.pageSize })
  ]);
  const txs = Array.isArray(list) ? list : [];
  const rows = txs.map((tx) =>
    '<tr>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm"><a class="text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300" href="' + localize('/explorer/tx/' + encodeURIComponent(tx.txid || '')) + '">' + esc(shortHash(tx.txid || '')) + '</a></td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatUtc(tx.timeFirstSeen)) + '</td>' +
    '<td class="whitespace-nowrap px-4 py-4 text-sm leading-6 tabular-nums text-gray-500 dark:text-gray-400">' + esc(formatBytes(tx.size || 0)) + '</td>' +
    '</tr>'
  );
  const series = Array.isArray(history?.series) ? history.series : [];
  const periodOptions = ['day', 'week', 'month', 'quarter', 'year'].map(function(p) {
    const active = p === period;
    const cls = active
      ? 'inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-primary-500 text-white'
      : 'inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200';
    return '<a href="' + localize('/explorer/mempool') + '?period=' + p + '&page=' + params.page + '&pageSize=' + params.pageSize + '" class="' + cls + '">' + esc(p) + '</a>';
  }).join('');
  const canonical = localize('/explorer/mempool');
  const breadcrumbs = [
    { label: workerI18nValue(safeLang, 'common.home', 'Home'), href: localize('/') },
    { label: workerText(safeLang, 'explorer', 'Explorer'), href: localize('/explorer') },
    { label: workerText(safeLang, 'mempool', 'Mempool'), href: canonical }
  ];
  const bodyInner = sectionHeader('clock', workerText(safeLang, 'mempool', 'Mempool'), workerText(safeLang, 'mempool_subtitle', 'Pending transaction queue and recent mempool evolution.')) +
    d3Styles() +
    '<div class="grid sm:grid-cols-2 gap-4 mb-6">' +
    compactStatCard('Pending TX', formatNumber(stats?.txCount || 0), 'Current mempool transaction count', 'txs') +
    compactStatCard('Mempool Size', formatBytes(stats?.totalBytes || 0), 'Current pending bytes', 'weight') +
    '</div>' +
    '<div class="mb-4 flex flex-wrap gap-2">' + periodOptions + '</div>' +
    '<div class="d3-card mb-5"><div class="d3-title">Mempool Size and Count</div><div id="mempool-trend-chart"></div></div>' +
    d3LineChartScript('mempool-trend-chart', series, [
      { key: 'txCount', label: 'Pending TX', color: '#6366f1' },
      { key: 'totalBytes', label: 'Pending Bytes', color: '#f59e0b' }
    ], safeLang) +
    renderTable(['Transaction ID', 'First Seen', 'Size'], rows, 'No pending transactions in mempool snapshot.', { withPagination: true, lang: safeLang }) +
    paginationHtml(localize('/explorer/mempool'), params.page, params.pageSize, Math.max(1, params.page + (txs.length === params.pageSize ? 1 : 0)), { lang: safeLang, extraParams: { period } });
  const body = legacyExplorerLayout('mempool', bodyInner, { lang: safeLang });
  return pageShell(canonical, 'Explorer Mempool', 'Lotusia mempool pending transactions and queue analytics.', body, {
    breadcrumbs,
    lang: safeLang
  });
}

function explorerErrorPage(pathname, message) {
  const body = '<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">Explorer Unavailable</h1>' +
    '<p class="text-gray-600 dark:text-gray-300 mb-6">Unable to load fresh explorer data for this route.</p>' +
    '<div class="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">' + esc(message) + '</div>';
  return pageShell(pathname, 'Explorer Unavailable', 'Unable to load explorer data.', body);
}