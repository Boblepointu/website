import { config } from '../config.js';

function headers() {
  const h = { accept: 'application/json' };
  if (config.lotusApiAuthToken) h.authorization = `Bearer ${config.lotusApiAuthToken}`;
  return h;
}

export async function lotusApiGet(path) {
  if (!config.lotusApiBaseUrl) throw new Error('LOTUS_API_BASE_URL is required');
  const base = config.lotusApiBaseUrl.replace(/\/+$/, '');
  const rel = String(path || '').startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${base}${rel}`, { headers: headers() });
  if (!res.ok) throw new Error(`Lotus API ${rel} failed with ${res.status}`);
  return res.json();
}

export async function getBlockchainInfo() {
  return lotusApiGet('/blockchain-info');
}

export async function getBlock(hashOrHeight) {
  return lotusApiGet(`/block/${encodeURIComponent(String(hashOrHeight))}`);
}

export async function getTx(txid) {
  return lotusApiGet(`/tx/${encodeURIComponent(String(txid))}`);
}

