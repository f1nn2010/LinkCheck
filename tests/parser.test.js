import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, extractAttribute, extractLinks, inspectHtml, looksLikeHtmlPage } from '../src/parser.js';

test('decodes common HTML entities safely', () => {
  assert.equal(decodeEntities('A&amp;B &#x1F680; &quot;ok&quot;'), 'A&B 🚀 "ok"');
  assert.equal(decodeEntities('&#0;'), '&#0;');
});

test('extracts links, resolves relative URLs, filters non-HTTP links and deduplicates', () => {
  const links = extractLinks('<a href="/docs#intro">Docs</a><a href=/docs>Again</a><a href="https://a.test?a=1&amp;b=2">External</a><a href="mailto:hi@test">Email</a>', 'https://demo.test/');
  assert.deepEqual(links, ['https://demo.test/docs', 'https://a.test/?a=1&b=2']);
});

test('extracts simple SEO metadata', () => {
  const html = '<title>Hello &amp; world</title><meta content="Nice work" name="description"><meta name="viewport" content="width=device-width"><h1>H</h1>';
  assert.deepEqual(inspectHtml(html), { title: 'Hello & world', description: 'Nice work', hasViewport: true, h1Count: 1, robots: '' });
  assert.equal(extractAttribute('<a href=hello>', 'href'), 'hello');
});

test('avoids crawling assets as HTML', () => {
  assert.equal(looksLikeHtmlPage('https://demo.test/a.pdf'), false);
  assert.equal(looksLikeHtmlPage('https://demo.test/blog/post'), true);
});
