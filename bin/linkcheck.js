#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { auditSite } from '../src/audit.js';

const help = `LinkCheck v0.1.0 — website audit CLI
Usage: linkcheck https://example.com [options]

Options:
  --max-pages N       Internal HTML pages to crawl (default 12, max 50)
  --max-links N       Unique links to check (default 100, max 500)
  --timeout N         Request timeout in milliseconds (default 8000)
  --no-external       Skip external links (but still list them)
  --allow-private     Permit localhost/internal hosts (CLI only; use with care)
  --format json|text  Output format (default text)
  --output FILE       Save the full JSON report
  --help              Show help
  --version           Print version

Exits with code 1 if any links are broken or unreachable; 2 for usage errors.
`;

export async function main(args) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0; }
  if (args.includes('--version')) { console.log('0.1.0'); return 0; }
  const options = {};
  let format = 'text';
  let output = null;
  let target = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--max-pages', '--max-links', '--timeout', '--format', '--output'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--format') format = value;
      else if (arg === '--output') output = value;
      else options[arg === '--max-pages' ? 'maxPages' : arg === '--max-links' ? 'maxLinks' : 'timeout'] = Number(value);
    } else if (arg === '--no-external') options.checkExternal = false;
    else if (arg === '--allow-private') options.allowPrivate = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!target) target = arg;
    else throw new Error('Specify only one target URL');
  }
  if (!target) throw new Error('A website URL is required. See --help.');
  if (!['json', 'text'].includes(format)) throw new Error('Format must be text or json');
  const report = await auditSite(target, options);
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (format === 'json') console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\nLinkCheck: ${report.target}`);
    console.log(`Pages: ${report.summary.pagesScanned} | Links: ${report.summary.linksChecked} | Broken: ${report.summary.brokenLinks} | Redirects: ${report.summary.redirectedLinks} | Warnings: ${report.summary.pageWarnings}`);
    for (const link of report.links.filter(item => ['broken', 'error', 'redirect'].includes(item.state))) {
      console.log(`  ${link.state.toUpperCase().padEnd(8)} ${link.status ?? '-'}  ${link.url}${link.error ? ` (${link.error})` : ''}`);
    }
    for (const page of report.pages.filter(p => p.issues.length)) {
      console.log(`  PAGE     ${page.url}: ${page.issues.join('; ')}`);
    }
    if (output) console.log(`Report saved: ${output}`);
  }
  return report.summary.brokenLinks ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`LinkCheck error: ${error.message}`);
    process.exitCode = 2;
  });
}
