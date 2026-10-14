import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { auditSite } from './audit.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8']
};
let activeAudits = 0;
const requestsByIp = new Map();

const server = http.createServer(async (req, res) => {
  const baseHeaders = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    'cache-control': 'no-store'
  };
  const respond = (code, content, mime = 'application/json; charset=utf-8') => {
    res.writeHead(code, { ...baseHeaders, 'content-type': mime });
    res.end(mime.startsWith('application/json') ? JSON.stringify(content) : content);
  };
  const path = (req.url || '').split('?')[0];
  if (req.method === 'GET' && path === '/health') return respond(200, { status: 'ok' });
  if (req.method === 'GET' && path in assets) {
    const [filename, mime] = assets[path];
    try { return respond(200, await readFile(new URL(`../public/${filename}`, import.meta.url)), mime); }
    catch { return respond(500, { error: 'Asset unavailable' }); }
  }
  if (req.method !== 'POST' || path !== '/api/audit') return respond(404, { error: 'Not found' });
  // Intended as a self-hosted tool. For internet-facing deployments add authentication,
  // egress restrictions and a persistent distributed rate limiter at the proxy.
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (requestsByIp.size > 1000) for (const [key, item] of requestsByIp) if (item.until < now) requestsByIp.delete(key);
  const limit = requestsByIp.get(ip) || { used: 0, until: now + 3600_000 };
  if (limit.until < now) { limit.used = 0; limit.until = now + 3600_000; }
  if (limit.used >= 12) return respond(429, { error: 'Audit limit reached for this hour' });
  if (activeAudits >= 2) return respond(503, { error: 'Server busy, retry shortly' });
  const pieces = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 4096) return respond(413, { error: 'Request body too large' });
    pieces.push(chunk);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(pieces).toString('utf8')); }
  catch { return respond(400, { error: 'Invalid JSON' }); }
  if (!input || typeof input.url !== 'string' || input.url.length > 2000) return respond(400, { error: 'Provide a URL of at most 2000 characters' });
  limit.used++;
  requestsByIp.set(ip, limit);
  activeAudits++;
  try {
    const result = await auditSite(input.url, {
      maxPages: input.maxPages ?? 12,
      maxLinks: input.maxLinks ?? 100,
      timeout: 7000,
      checkExternal: input.checkExternal !== false,
      allowPrivate: false
    });
    respond(200, result);
  } catch (error) {
    respond(400, { error: error.message });
  } finally { activeAudits--; }
});

server.requestTimeout = 20_000;
server.headersTimeout = 15_000;
server.listen(port, host, () => console.log(`LinkCheck dashboard: http://${host}:${port}`));
