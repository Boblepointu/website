async function renderExplorerBlocksPage(url, lang) {
  const safeLang = WORKER_LANGS.includes(lang) ? lang : 'en';
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const params = parsePageAndSize(url);
  const payload = await adaptBlocks(params.page, params.pageSize);
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
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const [overview, chainInfo, mempool] = await Promise.all([
    adaptOverview(),
    adaptChainInfo().catch(() => ({})),
    adaptMempool().catch(() => [])
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
  const hashrateText = hashrate > 0 ? (hashrate / 1e9).toFixed(1) + ' GH/s' : '-';
  const diffText = num(mining.difficulty || 0) > 0 ? num(mining.difficulty).toFixed(1) : '-';
  const blockTime = num(mining.target || 0) > 0 ? (num(mining.target) / 60).toFixed(1) + ' minutes' : '-';
  const cards = '<div class="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 mb-8">' +
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
  const keywords = workerI18nValue(safeLang, 'seo.explorer_blocks_keywords', [
    'Lotusia',
    workerText(safeLang, 'block_details', 'Block Details'),
    workerText(safeLang, 'transactions', 'Transactions'),
    workerText(safeLang, 'block_subsidy', 'Block Subsidy'),
    workerText(safeLang, 'size', 'Size'),
    workerText(safeLang, 'burned', 'Burned')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const payload = await adaptBlockDetail(hashOrHeight);
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
    '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">' +
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
  const keywords = workerI18nValue(safeLang, 'seo.explorer_blocks_keywords', [
    'Lotusia',
    workerText(safeLang, 'transaction_details', 'Transaction Details'),
    workerText(safeLang, 'inputs', 'Inputs'),
    workerText(safeLang, 'outputs', 'Outputs'),
    workerText(safeLang, 'confirmed', 'Confirmed')
  ].join(', '));
  const localize = function(path) { return withWorkerLangPrefix(safeLang, path); };
  const payload = await adaptTxDetail(txid);
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
    '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">' +
    compactStatCard('Time First Seen', formatUtc(payload.timeFirstSeen), 'When this tx first appeared', 'chart') +
    compactStatCard('Size', formatBytes(payload.size), 'Raw transaction size', 'network') +
    compactStatCard('Confirmations', formatNumber(payload.confirmations || 0), 'Current block confirmations', 'up') +
    '</div>' +
    '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">' + esc(workerText(safeLang, 'block_information', 'Block Information')) + '</h2>' +
    '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">' +
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
    adaptAddressDetail(address, params.page, params.pageSize),
    adaptAddressBalance(address)
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
    '<div class="grid grid-cols-2 gap-3 sm:gap-4 mb-8">' +
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

function explorerErrorPage(pathname, message) {
  const body = '<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-3">Explorer Unavailable</h1>' +
    '<p class="text-gray-600 dark:text-gray-300 mb-6">Unable to load fresh explorer data for this route.</p>' +
    '<div class="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">' + esc(message) + '</div>';
  return pageShell(pathname, 'Explorer Unavailable', 'Unable to load explorer data.', body);
}