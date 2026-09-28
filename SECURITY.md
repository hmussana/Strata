# Security policy

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting**: open the repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue for security problems.

You can expect an acknowledgement within a few days. Once a fix is released, reporters are credited unless they prefer otherwise.

## Scope

- The static site (`site/`): XSS, CSP bypasses, unsafe link handling, data leakage.
- The fetcher (`scripts/`): parsing of untrusted feeds, SSRF-style issues, output injection into the site or the weekly issue.
- The GitHub Actions workflows: permission scope, injection, supply chain.

## Design notes

- The site makes no third-party requests and runs under `default-src 'self'`.
- All feed-derived text is HTML-escaped before rendering, and only `http(s)` links are emitted.
- Feed responses are size-capped; one failing or hostile source can't break a run.
- Actions are pinned to full commit SHAs and each job gets the minimum permissions it needs. Dependabot proposes updates monthly.
- Optional LLM output is treated as untrusted: tags are validated against the concept list and summaries are escaped.
