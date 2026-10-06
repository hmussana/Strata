# Contributing to Strata

Thanks for helping keep the map current. Most contributions are edits to two JSON files, and no build tools are needed.

## Quick start

```bash
python3 -m http.server -d site 8000        # preview at http://localhost:8000
python3 scripts/fetch_news.py --reindex     # re-tag existing news after editing concepts
python3 -m unittest discover -s scripts     # must pass before you open a PR
```

## Adding or improving a concept

Concepts live in `site/data/concepts.json` under `layers → categories → items`. Each of the seven layers also carries `num`, `osi`, `moves`, `plain`, `tech` (featured concept ids) and `threats` (`name`, `what`, `example`, `defense`, optional `concept`); keep threats concrete, with a real-world example and a practical defence.



```jsonc
{
  "id": "dgx-spark",                       // unique, kebab-case, never renamed once published
  "name": "NVIDIA DGX Spark",
  "kind": "product",                       // concept | product | project | model
  "summary": "One line, under ~20 words.",
  "explainer": ["2-3 short paragraphs. Explain the mechanism, not the marketing."],
  "why": "One sentence on why a practitioner should care.",
  "diagram": { "type": "stack", "caption": "…", "layers": [ … ] },  // optional but encouraged
  "badges": ["NVIDIA"],
  "keywords": ["DGX Spark", "=GB10"],      // for news tagging, see below
  "related": ["bandwidth", "moe"],         // other concept ids
  "links": [{ "label": "Docs", "url": "https://…" }]           // official sources only
}
```

**Keywords** decide which news gets tagged to the concept:

- Plain strings match case-insensitively on word boundaries, tolerate `-`/space variants and a plural `s`.
- `"=MCP"` matches case-sensitively (use for short acronyms that collide with words).
- `"~regex"` is a raw regular expression for patterns such as MoE size notation.
- Prefer specific names over generic words; check with `--reindex` that tagging still looks right.

**Learning paths** are listed under `paths` as ordered concept ids.

**Radar noise**: add words that should never be proposed as new concepts to `radarIgnore`.

When you change content, bump `reviewed` to today's date.

### Diagram types

| type | use it for | fields |
|---|---|---|
| `flow` | pipelines and loops | `steps[{label, sub}]`, optional `loop{from, to, label}` |
| `stack` | layered architectures | `layers[{label, sub, hl}]` |
| `hub` | one thing connecting many | `center{label, sub}`, `spokes[{label, sub}]` |
| `sequence` | who talks to whom, in order | `actors[]`, `messages[{from, to, label}]` |
| `bars` | comparing magnitudes (auto log scale) | `unit`, `items[{label, value}]` |
| `compare` | side-by-side trade-offs | `columns[{title, points[]}]` |

Keep labels short (a few words) and put detail in `sub`. Numbers in diagrams should be approximate vendor specs or clearly marked *illustrative*.

## Adding a news source

Add an entry to `site/data/sources.json`:

```json
{ "id": "example", "name": "Example Blog", "type": "press", "url": "https://example.com/feed.xml", "limit": 10, "weight": 2 }
```

- `type`: `lab | community | research | press | security | release`
- `"filter": "ai"` keeps only AI-related items from general feeds.
- `"tags": ["concept-id"]` force-tags every item (for single-topic feeds such as release notes).
- Sources must be credible, publicly accessible RSS/Atom/JSON, and must not require authentication or scraping.
- Use the top-level `drop` list for title patterns that are promotions or noise.

## Review checklist

- [ ] Tests pass and every `related` / path id exists (the tests check this)
- [ ] Facts are sourced from official docs, papers or first-party announcements
- [ ] No tracking links, affiliate links or third-party scripts
- [ ] Copy is neutral and written for a general technical reader

## Code changes

The site is dependency-free by design: please don't add frameworks, CDNs, web fonts or analytics. Keep the CSP in `site/index.html` and `site/latest/index.html` intact, escape any data you render, and match the existing style.
