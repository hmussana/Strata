# The AI Stack: content model

All content lives in `site/content/` as JSON. Components never hard-code layers, concepts or relationships, so you
can add and edit content without touching code. Preview at `/next/` while the new site is being built.

```
site/content/
  model.json          title, layer order, zoom and depth levels, arrow legend, relationship types, staleness threshold
  layers/<id>.json    one file per layer
  concepts/<id>.json  one file per concept
  relationships.json  every labelled edge between concepts (single source of truth)
  crosscutting.json   the cross-cutting concerns shown as vertical bands
  flows.json          "request goes down" and "capability flows up" steps
  dashboard.json      Z0 indicators per layer
```

## Why JSON

Browsers read it natively (no build step, no dependencies), it diffs cleanly, and it can be edited in GitHub's web
editor. Long text is written as an array of paragraphs. Text fields support a tiny safe markup subset:
`**bold**`, `*italic*`, `` `code` ``, and `[label](https://…)` or `[label](#/concept/id)`.

## Layer

| Field | Notes |
|---|---|
| `id`, `name`, `order` | `order` 1 = bottom of the stack |
| `color` | token `l1`…`l9`, defined in `site/next/next.css` for both themes |
| `icon` | a name from `site/next/icons.js` |
| `oneLiner` | one plain-English sentence |
| `analogy.text`, `analogy.breaks` | everyday analogy plus where it breaks (breaks shown from D2 up) |
| `examples` | 3–5 example concepts or players |
| `givesAbove`, `needsBelow` | what flows to the layer above and from the layer below |
| `concepts` | ordered concept ids |
| `metaDiagram.nodes` | concepts shown in the Z2 map; optional `x`/`y` layout hints |
| `walkthrough` | 3–6 steps: `{ title, text, highlight: [conceptIds] }` |
| `newsKeywords` | terms that count a news story toward this layer (drives "News this week" on Z0); `=` prefix = case-sensitive |
| `status`, `lastReviewed` | `draft` or `reviewed`; ISO date, shown on the page |

## Dashboard (Z0)

`indicators` lists 3–6 indicators, each with a `definition` shown in the "About these indicators" panel (maturity
also has a `rubric`). `layers.<id>.<indicator>` holds `{ value, source, asOf }` (maturity adds a `rationale`); the
validator rejects values without a source and date. "News this week" is measured, not authored: the news fetcher
counts stories matching each layer's `newsKeywords`, and trends appear once 14 days have been collected.

## Concept

| Field | Notes |
|---|---|
| `id`, `layer`, `name`, `summary` | |
| `prerequisites` | concept ids worth knowing first |
| `depths.D1` … `depths.D5` | D1, D2 and D5 are required; D3/D4 where interaction earns the "aha" |
| `sources` | `{ title, url, date, verify }`; shown at D5; `verify: true` = cited from memory, needs checking |
| `status`, `lastReviewed` | as above |

Each depth holds: `text` (paragraphs), optional `diagram` (spec, see below), `interactive` (component id),
`narration` (script for text-to-speech at D1), `analogy` + `analogyBreaks` (breaks required from D2 up), and
`predict` `{ question, options, answer (index), explanation }`. Every concept needs at least one `predict`.

## Relationship

`{ from, to, type, label }`. `type` is one of `feeds`, `enables`, `depends-on`, `optimizes`, `competes-with`,
`part-of`; each maps to an arrow style in `model.json`. `label` is the words shown on the edge, read as
"from *label* to", e.g. "Pretraining data *teaches* next-token prediction". Concepts don't store their own related
lists; they're derived from this file so maps and links never drift apart.

## Diagrams

Diagrams are generated from specs so they stay consistent and update with the data:
`flow` (optionally `numbered`, with a `loop`), `stack`, `hub`, `bars`, `compare`, `sequence`. Every diagram gets an
automatic text alternative for screen readers.

## Accuracy rules

- Never invent figures, market data or benchmarks. Use the literal string `PLACEHOLDER`; it renders as a visible
  marker and appears in the report.
- Name real products only in `examples` or dashboard `players`, not in core explanations.
- Draft content keeps `status: "draft"` until reviewed. Anything older than `staleAfterDays` is flagged on the page.

## Checks

```bash
python3 scripts/validate_content.py            # schema, references, depth rules, icons, WCAG AA colour contrast
python3 scripts/validate_content.py --report   # placeholders to fill, sources to verify, drafts to review
```

CI runs both on every push and pull request.
