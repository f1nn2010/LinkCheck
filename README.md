# LinkCheck ↗

**Open-source website link checker and lightweight auditor.** Find broken links,
redirects, missing page titles and descriptions, responsive viewport issues,
heading problems and missing security headers. Use the same dependency-free
Node.js engine through a polished web interface, the CLI, or GitHub Actions.

[![CI](https://img.shields.io/badge/tests-node%2020%20%2B%2022-brightgreen)](#tests)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D20-green)

> **Project status:** v0.1.0 starter release. Built to be useful, self-hosted,
> and extended by the community. This is not a full SEO or accessibility
> compliance audit, and results only cover the bounded crawl sample.

## Features

- **Web dashboard:** Enter a public URL, choose crawl limits, and export JSON.
- **Link checking:** Detect HTTP 4xx/5xx, network failures and HTTP redirects.
- **Site crawling:** Traverse internal HTML pages, deduplicate outgoing links,
  and optionally check external links.
- **Basic page audits:** Title, description, H1, viewport, HSTS (HTTPS), and
  `X-Content-Type-Options` checks.
- **CLI:** Text or JSON output, optional file export, CI-friendly exit status.
- **GitHub Action:** Fail builds when audited websites have broken links.
- **Zero runtime dependencies:** Uses built-in Node.js modules only.

## Quick start

**Requires Node.js 20 or newer.**

```bash
# Clone your copy of the repository
npm test
npm start
# Open http://127.0.0.1:3000
```

### CLI

```bash
node bin/linkcheck.js https://example.com
node bin/linkcheck.js https://example.com --max-pages 25 --max-links 150 --output report.json
node bin/linkcheck.js https://example.com --format json --no-external
```

After publishing this package to npm, users can install it globally or run it
from their project. **No npm publication is implied by this starter ZIP.**

CLI exit codes: `0` = no broken links found; `1` = at least one broken or
unreachable link; `2` = invalid input or operational failure.

### GitHub Actions

After you publish this repository under your GitHub account, you can reference
it from another repository's workflow (replace `YOUR_NAME` with your handle and
`v0.1.0` with a tag you actually publish):

```yaml
name: Check website links
on:
  workflow_dispatch:
jobs:
  linkcheck:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - uses: YOUR_NAME/linkcheck@v0.1.0
        with:
          url: https://example.com
          max-pages: '12'
          max-links: '100'
```

`action.yml` is a composite Action and requires a Node.js installation on the
runner. It writes a full report to the runner's temp directory. For stricter
supply-chain controls, pin third-party Actions to immutable commit SHAs.

### Docker

```bash
docker build -t linkcheck .
docker run --rm -p 127.0.0.1:3000:3000 linkcheck
```

Open <http://127.0.0.1:3000>. To deploy elsewhere, set `PORT` and `HOST`
through environment variables. **Read [SECURITY.md](SECURITY.md) before exposing
this service publicly.**

## API

`POST /api/audit` with JSON:

```json
{
  "url": "https://example.com",
  "maxPages": 12,
  "maxLinks": 100,
  "checkExternal": true
}
```

Response contains `summary`, scanned `pages`, audited `links`, timestamps,
and options. The web API deliberately does not expose the CLI's local-network
option. `GET /health` returns a simple health response.

## Design and limitations

- Uses lightweight HTML tag extraction, not a full browser or JavaScript
  renderer. JS-injected links are not discovered.
- Checks anchor links (`<a href>`); does not scan CSS, images, scripts,
  canonical tags, or sitemap entries yet.
- Only standard HTTP(S) ports 80 and 443 are accessible from the web UI.
- Applies 1 MB HTML response limit and bounded crawl limits.
- Provides basic security header checks, **not** a penetration test.
- External sites may block HEAD requests. The CLI retries GET when HEAD
  responds with 403, 405 or 501.
- Results are not stored on a server. The dashboard's JSON export is local.
- Be considerate with scans. Respect rate limits, site access requirements and
  owners' permission.

## Tests

```bash
npm test
```

CI runs tests with Node.js 20 and 22. Integration tests exercise crawling and
redirect detection against an isolated local HTTP fixture.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests that improve correctness,
security and developer experience are welcome. All adopted features should
include tests.

## Roadmap

- [ ] Standards-compliant streaming HTML parser
- [ ] `robots.txt` / sitemap support
- [ ] GitHub pull-request annotations
- [ ] Scheduled scans and results history
- [ ] Optional Playwright rendering for client-side applications
- [ ] CSV, SARIF and Markdown reports

## License

MIT — see [LICENSE](LICENSE).
