import { extractLinks, inspectHtml, looksLikeHtmlPage } from './parser.js';
import { requestUrl, validateUrl } from './network.js';

function clamp(value, min, max) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, Math.floor(num))) : min;
}

function sameSite(a, b) {
  return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
}

export async function auditSite(input, options = {}) {
  const opts = {
    maxPages: clamp(options.maxPages ?? 12, 1, 50),
    maxLinks: clamp(options.maxLinks ?? 100, 1, 500),
    timeout: clamp(options.timeout ?? 8000, 1000, 30000),
    checkExternal: options.checkExternal !== false,
    allowPrivate: options.allowPrivate === true
  };
  const root = validateUrl(input, opts.allowPrivate).toString();
  const startedAt = new Date().toISOString();
  const queue = [root];
  const discoveredPages = new Set([root]);
  const pages = [];
  const linkSources = new Map();

  while (queue.length && pages.length < opts.maxPages) {
    const pageUrl = queue.shift();
    const page = { url: pageUrl, status: null, title: '', description: '', issues: [], linksFound: 0 };
    pages.push(page);
    try {
      const result = await requestUrl(pageUrl, { timeout: opts.timeout, allowPrivate: opts.allowPrivate });
      page.status = result.status;
      page.finalUrl = result.finalUrl;
      if (result.status >= 400) page.issues.push(`HTTP ${result.status}`);
      if (result.redirects.length) page.issues.push(`${result.redirects.length} redirect(s)`);
      const type = String(result.headers['content-type'] ?? '');
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) continue;
      const meta = inspectHtml(result.body);
      Object.assign(page, meta);
      if (!meta.title) page.issues.push('Missing page title');
      if (!meta.description) page.issues.push('Missing meta description');
      if (!meta.hasViewport) page.issues.push('Missing responsive viewport metadata');
      if (meta.h1Count === 0) page.issues.push('No H1 heading');
      if (meta.h1Count > 1) page.issues.push('Multiple H1 headings');
      if (result.truncated) page.issues.push('HTML truncated at 1 MB');
      if (!result.headers['x-content-type-options']) page.issues.push('Missing X-Content-Type-Options header');
      if (new URL(pageUrl).protocol === 'https:' && !result.headers['strict-transport-security']) page.issues.push('Missing HSTS header');
      const links = extractLinks(result.body, result.finalUrl);
      page.linksFound = links.length;
      for (const url of links) {
        if (!linkSources.has(url) && linkSources.size < opts.maxLinks) linkSources.set(url, []);
        if (linkSources.has(url)) linkSources.get(url).push(pageUrl);
        if (sameSite(url, root) && looksLikeHtmlPage(url) && !discoveredPages.has(url) && discoveredPages.size < opts.maxPages) {
          discoveredPages.add(url);
          queue.push(url);
        }
      }
    } catch (error) {
      page.issues.push(error.message);
    }
  }

  const entries = [...linkSources.entries()];
  const checked = await mapLimited(entries, 5, async ([url, sources]) => {
    const external = !sameSite(url, root);
    if (external && !opts.checkExternal) return { url, sources, external, state: 'skipped', status: null };
    try {
      let response = await requestUrl(url, { method: 'HEAD', timeout: opts.timeout, maxBytes: 0, allowPrivate: opts.allowPrivate });
      if ([403, 405, 501].includes(response.status)) {
        response = await requestUrl(url, { method: 'GET', timeout: opts.timeout, maxBytes: 0, allowPrivate: opts.allowPrivate });
      }
      return {
        url, sources, external,
        status: response.status,
        finalUrl: response.finalUrl,
        redirectCount: response.redirects.length,
        state: response.status >= 400 ? 'broken' : response.redirects.length ? 'redirect' : 'ok'
      };
    } catch (error) {
      return { url, sources, external, status: null, state: 'error', error: error.message };
    }
  });
  const summary = {
    pagesScanned: pages.length,
    linksChecked: checked.filter(x => x.state !== 'skipped').length,
    brokenLinks: checked.filter(x => x.state === 'broken' || x.state === 'error').length,
    redirectedLinks: checked.filter(x => x.state === 'redirect').length,
    pageWarnings: pages.reduce((n, p) => n + p.issues.length, 0)
  };
  return { tool: 'LinkCheck', version: '0.1.0', target: root, startedAt, completedAt: new Date().toISOString(), options: { ...opts, allowPrivate: undefined }, summary, pages, links: checked };
}

async function mapLimited(items, concurrency, fn) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index]);
    }
  }));
  return output;
}
