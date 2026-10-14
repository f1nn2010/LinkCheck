import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/** Reject loopback, RFC1918, link-local, CGNAT, multicast and other non-public addresses. */
export function isPublicIp(ip) {
  const family = net.isIP(ip);
  if (!family) return false;
  if (family === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 && (c === 0 || c === 2) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff')) return false;
  // IPv4 mapped and IPv4-compatible IPv6 (including embedded private addresses).
  if (/^::(?:ffff:)?(?:\d{1,3}\.){3}\d{1,3}$/i.test(ip)) {
    const tail = ip.replace(/^::(?:ffff:)?/i, '');
    return isPublicIp(tail);
  }
  // Allowlist only globally routable 2000::/3 unicast.
  const first = Number.parseInt(lower.split(':')[0] || '0', 16);
  return first >= 0x2000 && first <= 0x3fff;
}

export async function resolveAddress(hostname, allowPrivate = false) {
  const literal = hostname.replace(/^\[|\]$/g, '');
  let addresses;
  if (net.isIP(literal)) addresses = [{ address: literal, family: net.isIP(literal) }];
  else addresses = await dns.lookup(literal, { all: true, verbatim: true });
  const permitted = addresses.filter(item => allowPrivate || isPublicIp(item.address));
  if (!permitted.length || (!allowPrivate && permitted.length !== addresses.length)) {
    throw new Error('Blocked: URL resolves to a private, reserved, or local network address');
  }
  return permitted[0];
}

export function validateUrl(input, allowPrivate = false) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed');
  if (!url.hostname) throw new Error('URL must have a hostname');
  if (!allowPrivate && url.port && !['80', '443'].includes(url.port)) throw new Error('Only ports 80 and 443 are supported');
  url.hash = '';
  return url;
}

/** All request hops resolve and pin a vetted IP, mitigating DNS rebinding. */
export async function requestUrl(input, { method = 'GET', timeout = 8000, maxBytes = 1024 * 1024, allowPrivate = false, redirectLimit = 5 } = {}) {
  let current = validateUrl(input, allowPrivate);
  const redirects = [];
  for (let hop = 0; hop <= redirectLimit; hop++) {
    const { address, family } = await resolveAddress(current.hostname, allowPrivate);
    const client = current.protocol === 'https:' ? https : http;
    const response = await new Promise((resolve, reject) => {
      let settled = false;
      const req = client.request(current, {
        method,
        timeout,
        headers: { 'user-agent': 'LinkCheck/0.1 (+https://github.com/)', accept: method === 'HEAD' ? '*/*' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
        lookup: (_hostname, _options, callback) => callback(null, address, family)
      }, res => {
        const chunks = [];
        let size = 0;
        let truncated = false;
        res.on('data', chunk => {
          size += chunk.length;
          if (size <= maxBytes) chunks.push(chunk);
          else { truncated = true; res.destroy(); }
        });
        res.on('end', () => {
          if (!settled) { settled = true; resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), truncated }); }
        });
        res.on('close', () => {
          if (truncated && !settled) { settled = true; resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), truncated: true }); }
        });
        res.on('error', err => {
          if (truncated && !settled) { settled = true; resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), truncated: true }); }
          else if (!settled) { settled = true; reject(err); }
        });
      });
      req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeout}ms`)));
      req.on('error', err => { if (!settled) { settled = true; reject(err); } });
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      if (hop === redirectLimit) throw new Error('Too many redirects');
      redirects.push(current.toString());
      current = validateUrl(new URL(response.headers.location, current).toString(), allowPrivate);
      continue;
    }
    return { ...response, finalUrl: current.toString(), redirects };
  }
  throw new Error('Too many redirects');
}
