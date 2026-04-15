// Adapter layer: translates lotusd /api/v1/* responses into the legacy
// /api/explorer/* shapes consumed by explorer-render.js.

async function adaptOverview() {
  const [mining, peers, chain] = await Promise.all([
    fetchNodeApi('mining'),
    fetchNodeApi('network/peers'),
    fetchNodeApi('chain')
  ]);
  const peerList = Array.isArray(peers) ? peers : (peers.data || []);
  return {
    mininginfo: {
      networkhashps: mining.networkhashps || 0,
      difficulty: mining.difficulty || 0,
      target: 120
    },
    peerinfo: peerList.map(function(p) {
      return {
        addr: p.addr || '',
        subver: p.subver || '',
        synced_headers: p.startingheight || 0,
        synced_blocks: p.startingheight || 0
      };
    })
  };
}

async function adaptChainInfo() {
  const chain = await fetchNodeApi('chain');
  return {
    tipHeight: chain.height || 0,
    blocks: chain.height || 0
  };
}

async function adaptMempool() {
  const mp = await fetchNodeApi('mempool');
  return mp.transactions || [];
}

async function adaptBlocks(page, pageSize) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  const data = await fetchNodeApi('blocks', { limit: limit, offset: offset });
  const items = data.data || [];
  const total = (data.pagination && data.pagination.total) || items.length;
  const tipHeight = total > 0 ? total - 1 : 0;
  return {
    blocks: items.map(function(b) {
      return {
        blockInfo: {
          hash: b.hash || '',
          height: b.height || 0,
          timestamp: b.time || 0,
          numBurnedSats: 0,
          numTxs: b.n_tx || 0,
          blockSize: b.size || 0
        }
      };
    }),
    tipHeight: tipHeight
  };
}

async function adaptBlockDetail(hashOrHeight) {
  const [block, txsData] = await Promise.all([
    fetchNodeApi('blocks/' + encodeURIComponent(hashOrHeight)),
    fetchNodeApi('blocks/' + encodeURIComponent(hashOrHeight) + '/txs', { limit: 500 })
  ]);
  const txList = (txsData.data || []);
  const txs = txList.map(function(t) {
    return {
      txid: t.txid || '',
      timeFirstSeen: block.time || 0,
      sumBurnedSats: 0,
      isCoinbase: t.block_pos === 0,
      inputs: new Array(t.input_count || 0),
      outputs: new Array(t.output_count || 0),
      size: t.size || 0
    };
  });
  const coinbaseTx = txList.find(function(t) { return t.block_pos === 0; });
  let minedBy = '';
  if (coinbaseTx && coinbaseTx.txid) {
    try {
      const outs = await fetchNodeApi('txs/' + coinbaseTx.txid + '/outputs');
      const outList = Array.isArray(outs) ? outs : (outs.data || []);
      const first = outList.find(function(o) { return o.address; });
      if (first) minedBy = first.address;
    } catch (_) {}
  }
  return {
    blockInfo: {
      hash: block.hash || '',
      height: block.height || 0,
      timestamp: block.time || 0,
      reward: 0,
      blockSize: block.size || 0,
      numTxs: block.n_tx || txs.length,
      numBurnedSats: 0
    },
    txs: txs,
    minedBy: minedBy
  };
}

async function adaptTxDetail(txid) {
  const [tx, inputs, outputs] = await Promise.all([
    fetchNodeApi('txs/' + encodeURIComponent(txid)),
    fetchNodeApi('txs/' + encodeURIComponent(txid) + '/inputs'),
    fetchNodeApi('txs/' + encodeURIComponent(txid) + '/outputs')
  ]);
  const inputList = Array.isArray(inputs) ? inputs : (inputs.data || []);
  const outputList = Array.isArray(outputs) ? outputs : (outputs.data || []);
  const isCoinbase = tx.input_count === 0 || inputList.length === 0;
  let blockInfo = {};
  if (tx.block_height != null && tx.block_height >= 0) {
    try {
      const blk = await fetchNodeApi('blocks/' + tx.block_height);
      blockInfo = { hash: blk.hash || '', timestamp: blk.time || 0 };
    } catch (_) {}
  }
  return {
    txid: tx.txid || txid,
    timeFirstSeen: blockInfo.timestamp || 0,
    size: tx.size || 0,
    confirmations: tx.confirmations || 0,
    isCoinbase: isCoinbase,
    block: blockInfo,
    inputs: isCoinbase
      ? [{ address: '', value: 0, isCoinbase: true }]
      : inputList.map(function(inp) {
          return { address: inp.address || '', value: inp.value_sats || 0 };
        }),
    outputs: outputList.map(function(out) {
      return {
        address: out.address || '',
        value: out.value_sats || 0,
        rankOutput: out.script_type === 'nulldata' || (!out.address && out.value_sats === 0)
      };
    })
  };
}

async function adaptAddressDetail(address, page, pageSize) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  const [info, txsData] = await Promise.all([
    fetchNodeApi('addresses/' + encodeURIComponent(address)),
    fetchNodeApi('addresses/' + encodeURIComponent(address) + '/txs', { limit: limit, offset: offset })
  ]);
  const items = txsData.data || [];
  const total = (txsData.pagination && txsData.pagination.total) || items.length;
  const numPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    history: {
      txs: items.map(function(t) {
        return {
          txid: t.txid || '',
          timeFirstSeen: 0,
          sumBurnedSats: 0,
          inputs: [],
          outputs: [],
          size: 0,
          block: { timestamp: 0 }
        };
      }),
      numPages: numPages
    },
    lastSeen: info.last_height || 0
  };
}

async function adaptAddressBalance(address) {
  const info = await fetchNodeApi('addresses/' + encodeURIComponent(address));
  return info.balance_sats || 0;
}
