const form = document.querySelector('#audit-form');
const scan = document.querySelector('#scan');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
let lastReport = null;

const text = (tag, content, className = '') => {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (scan.disabled) return;
  scan.disabled = true;
  scan.textContent = 'Scanning…';
  status.textContent = 'Checking pages and links. Larger sites can take longer.';
  status.className = 'status';
  results.hidden = true;
  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: document.querySelector('#website').value.trim(),
        maxPages: Number(document.querySelector('#max-pages').value),
        maxLinks: Number(document.querySelector('#max-links').value),
        checkExternal: document.querySelector('#external').checked
      })
    });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || `Request failed: ${response.status}`);
    lastReport = report;
    render(report);
    status.textContent = 'Audit completed successfully.';
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    status.className = 'status error';
    status.textContent = `Unable to audit website: ${error.message}`;
  } finally {
    scan.disabled = false;
    scan.innerHTML = 'Run audit <span aria-hidden="true">↗</span>';
  }
});

function render(report) {
  document.querySelector('#result-url').textContent = report.target;
  const summary = document.querySelector('#summary');
  summary.replaceChildren();
  for (const [label, count] of [
    ['PAGES SCANNED', report.summary.pagesScanned],
    ['LINKS CHECKED', report.summary.linksChecked],
    ['BROKEN LINKS', report.summary.brokenLinks],
    ['REDIRECTS', report.summary.redirectedLinks],
    ['PAGE WARNINGS', report.summary.pageWarnings]
  ]) {
    const card = text('div', '', 'stat');
    card.append(text('strong', String(count), label === 'BROKEN LINKS' && count ? 'danger' : ''), text('span', label));
    summary.append(card);
  }
  const problemLinks = report.links.filter(item => ['broken', 'error', 'redirect'].includes(item.state));
  document.querySelector('#link-count').textContent = `${problemLinks.length} to review`;
  const table = document.querySelector('#links-body');
  table.replaceChildren();
  if (!problemLinks.length) {
    const row = document.createElement('tr');
    const cell = text('td', 'No broken or redirected links detected in the scanned sample.', 'empty');
    cell.colSpan = 4;
    row.append(cell);
    table.append(row);
  }
  for (const link of problemLinks) {
    const row = document.createElement('tr');
    const urlCell = document.createElement('td');
    const anchor = text('a', link.url);
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    urlCell.append(anchor);
    const stateCell = document.createElement('td');
    stateCell.append(text('span', link.state, `state ${link.state}`));
    row.append(urlCell, stateCell, text('td', String(link.status ?? '—')), text('td', link.sources?.[0] || '—'));
    table.append(row);
  }
  const pages = document.querySelector('#pages');
  document.querySelector('#page-count').textContent = `${report.pages.length} pages`;
  pages.replaceChildren();
  for (const page of report.pages) {
    const card = text('article', '', 'page-card');
    card.append(text('div', page.url, 'page-url'), text('h4', page.title || 'Untitled page'));
    if (!page.issues.length) card.append(text('p', '✓ No basic page warnings detected', 'good'));
    for (const issue of page.issues) card.append(text('p', `⚠ ${issue}`, 'issue'));
    pages.append(card);
  }
}

document.querySelector('#download').addEventListener('click', () => {
  if (!lastReport) return;
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'linkcheck-report.json';
  anchor.click();
  URL.revokeObjectURL(url);
});
