import http from 'node:http';
import { URL } from 'node:url';
import { config } from './config.js';
import { handleApiRequest } from './api/contract.js';

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/healthz') {
      return send(res, 200, { ok: true, service: 'lotusia-sqlite-cloud-edge' });
    }
    if (url.pathname.startsWith('/api/')) {
      const payload = await handleApiRequest(url.pathname, url.searchParams);
      if (payload === null) return send(res, 404, { error: 'not_found' });
      return send(res, 200, payload);
    }
    return send(res, 404, { error: 'not_found' });
  } catch (err) {
    return send(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(config.port, () => {
  console.log(`[sqlite-cloud-edge] listening on ${config.port}`);
});

