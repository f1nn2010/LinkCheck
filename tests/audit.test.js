import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { auditSite } from '../src/audit.js';
import { isPublicIp, requestUrl, validateUrl } from '../src/network.js';

function fixture() {
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html', 'x-content-type-options': 'nosniff' });
      res.end('<title>Demo</title><meta name="viewport" content="width=device-width"><h1>Home</h1><a href="/ok">Good</a><a href="/gone">Bad</a><a href="/redirect">Moved</a>');
    } else if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>OK</title><h1>Hello</h1>');
    } else if (req.url === '/gone') {
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('missing');
    } else if (req.url === '/redirect') {
      res.writeHead(301, { location: '/ok' }); res.end();
    } else { res.writeHead(404); res.end(); }
  });
  return server;
}

test('blocks non-public addresses and unsupported URL schemes', () => {
  for (const ip of ['127.0.0.1', '10.3.2.1', '172.18.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1', '::ffff:127.0.0.1']) assert.equal(isPublicIp(ip), false, ip);
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.throws(() => validateUrl('file:///etc/passwd'), /Only HTTP/);
  assert.throws(() => validateUrl('http://example.com:4444'), /ports 80 and 443/);
  assert.throws(() => validateUrl('https://user:pass@example.com'), /credentials/);
});

test('audits local fixture when explicit CLI-only override is enabled', async t => {
  const server = fixture();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/`;
  await assert.rejects(() => requestUrl(base), /Only ports 80 and 443/);
  const report = await auditSite(base, { maxPages: 3, maxLinks: 10, allowPrivate: true });
  assert.equal(report.summary.pagesScanned, 3);
  assert.equal(report.summary.linksChecked, 3);
  assert.equal(report.summary.brokenLinks, 1);
  assert.equal(report.summary.redirectedLinks, 1);
  assert.equal(report.links.find(l => l.url.endsWith('/gone')).status, 404);
  assert.equal(report.links.find(l => l.url.endsWith('/redirect')).state, 'redirect');
  assert.ok(report.pages[0].issues.includes('Missing meta description'));
});
