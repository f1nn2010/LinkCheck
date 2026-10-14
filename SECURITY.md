# Security policy

Please report vulnerabilities privately to the repository owner using GitHub's
**Report a vulnerability** feature. Do not publish credentials or exploitation
details in public issues.

## Important deployment warning

The dashboard performs outgoing network requests to user-supplied URLs.
It restricts schemes, ports, redirects and private/reserved destinations,
and pins vetted DNS resolutions on each request. These safeguards reduce risk,
but do not replace a proper outbound firewall, authentication or rate limiting.

**Do not expose this starter application as an unrestricted public scanning
service.** Run it locally or behind an authenticated reverse proxy, restrict
outbound traffic at the network layer, and add distributed abuse protection
before enabling public access. Shared hosting platforms and cloud metadata
endpoints require particular care.

The CLI supports `--allow-private` for deliberate internal site testing; never
pass that option to an untrusted job or untrusted URL.

The crawler is intentionally bounded but does not honor robots.txt automatically.
Only audit sites you own or have permission to assess and respect site policies.
