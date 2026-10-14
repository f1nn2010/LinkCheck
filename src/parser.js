/** Minimal, dependency-free HTML extraction intended for link audits, not general HTML parsing. */
export function decodeEntities(value) {
  return String(value).replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|quot|apos|lt|gt|nbsp);?/gi, (original, entity) => {
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    const normalized = entity.toLowerCase();
    if (normalized in named) return named[normalized];
    if (normalized.startsWith('#')) {
      const hex = normalized.startsWith('#x');
      const code = Number.parseInt(normalized.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : original;
    }
    return original;
  });
}

export function extractAttribute(tag, attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const found = re.exec(tag);
  return found ? decodeEntities(found[1] ?? found[2] ?? found[3] ?? '') : null;
}

export function extractLinks(html, pageUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = extractAttribute(match[0], 'href');
    if (!href) continue;
    try {
      const url = new URL(href, pageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      url.hash = '';
      links.push(url.toString());
    } catch { /* Invalid link will be reported by browser, but is not fetchable. */ }
  }
  return [...new Set(links)];
}

export function inspectHtml(html) {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  const descriptionTag = [...html.matchAll(/<meta\b[^>]*>/gi)].find(([tag]) => extractAttribute(tag, 'name')?.toLowerCase() === 'description');
  const viewportTag = [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => extractAttribute(tag, 'name')?.toLowerCase() === 'viewport');
  const h1Count = [...html.matchAll(/<h1\b[^>]*>/gi)].length;
  const robotsTag = [...html.matchAll(/<meta\b[^>]*>/gi)].find(([tag]) => extractAttribute(tag, 'name')?.toLowerCase() === 'robots');
  return {
    title: title ? decodeEntities(title.replace(/<[^>]*>/g, '').trim()) : '',
    description: descriptionTag ? (extractAttribute(descriptionTag[0], 'content') ?? '') : '',
    hasViewport: viewportTag,
    h1Count,
    robots: robotsTag ? (extractAttribute(robotsTag[0], 'content') ?? '') : ''
  };
}

export function looksLikeHtmlPage(url) {
  const path = new URL(url).pathname.toLowerCase();
  return !/\.(?:png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|mp[34]|mov|webm|woff2?|ttf|eot|css|js|mjs|json|xml|txt|map|exe|dmg|apk)$/i.test(path);
}
