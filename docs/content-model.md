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
| `metaDiagram.nodes` | concepts shown in the Z2 concept map; optional `x`/`y` layout hints (0–100) |
| `walkthrough` | 3–6 steps: `{ title, text, highlight: [conceptIds] }`; edges between highlighted concepts light up too |
| `newsKeywords` | terms that count a news story toward this layer (drives "News this week" on Z0); `=` prefix = case-sensitive |
| `researchKeywords` | optional narrower terms for counting arXiv papers (words like "dataset" appear in most abstracts); falls back to `newsKeywords` |
| `status`, `lastReviewed` | `draft` or `reviewed`; ISO date, shown on the page |

## Dashboard (Z0)

`indicators` lists 3–6 indicators, each with a `definition` shown in the "How these are measured" panel.
Authored values (`layers.<id>.players`, `layers.<id>.maturity`) hold `{ value, source, asOf }`; the validator rejects
values without a source and date.

**Maturity** is a 0–100 score from five questions answered `yes` (1), `partial` (0.5) or `no` (0), each with a
one-line `why`:

```
score = 100 × (sum of answers) ÷ 5      bands: Emerging 0–39 · Growing 40–69 · Mature 70–100
```

The criteria, answer values, formula and bands live in `dashboard.json` and are shown on the page with a per-layer
breakdown table. Store the answers and the resulting `value`; the validator recomputes the score and fails if they
disagree.

**Measured indicators** are computed by `scripts/fetch_news.py`, not authored:

- *News this week*: stories in the news feed matching each layer's `newsKeywords` (trends after 14 days).
- *Research this week*: new arXiv papers (cs.AI, cs.CL, cs.LG, cs.DC, cs.AR; cross-listings counted once,
  replacements skipped) whose title or abstract matches the same keywords, summed over the last 7 announcement days.

**Cost headline**: `crosscutting.json` → `cost.headline` holds one sourced figure (Big Tech quarterly capital spending
from company filings), updated by hand each quarter.

## Concept

| Field | Notes |
|---|---|
| `id`, `layer`, `name`, `summary` | |
| `prerequisites` | concept ids worth knowing first |
| `depths.D1` … `depths.D5` | D1, D2 and D5 are required; D3/D4 where interaction earns the "aha" |
| `sources` | `{ title, url, date, verify }`; shown at D5; `verify: true` = cited from memory, needs checking |
| `status`, `lastReviewed` | as above |

Each depth holds `text` (paragraphs) plus any of:

| Field | Notes |
|---|---|
| `diagram` | a diagram spec (see below) |
| `analogy`, `analogyBreaks` | breaks required from D2 up |
| `predict` | `{ question, options, answer (index), explanation }`; every concept needs at least one |
| `guide` | D1: one line said by the guide character (`model.json` → `guide`) |
| `narration` | D1 only: script read aloud by the browser's built-in speech engine ("Listen"); the button is hidden where speech isn't supported, and the text hides while it plays with a one-tap "Show the text" |
| `interactive`, `interactiveConfig` | an explorable id from `site/next/explorables/index.js` and the data it needs; loaded only when the page uses it |
| `tasks` | "Try this" prompts for the explorable (list of strings) |
| `code` | pseudo-code, shown as a block (D4) |
| `tradeoffs` | list of strings (D4) |

**Explorables** live in `site/next/explorables/`. To add one, write a module that exports a mount function and register
it in `index.js`; the validator rejects ids that aren't registered. `sampling-play` (D3: temperature and top-k with a
"Sample 20" tally) and `sampling-workbench` (D4: editable scores, each step of the softmax shown, top-p) share one
module. Example numbers in `interactiveConfig` must be labelled illustrative (`note`).

## Concept map (Z2)

Generated from `relationships.json`: the layer's concepts are nodes, each relationship is an arrow in its type's style
with its `label` on a pill, and concepts from other layers that connect in appear as dashed "ghost" nodes along the
top (layers above) or bottom (layers below), placed near what they connect to. Hover, focus or tap a concept to light
up its connections; the walkthrough steps through `walkthrough`. A text list of every connection sits below the map.

## Relationship

`{ from, to, type, label }`. `type` is one of `feeds`, `enables`, `depends-on`, `optimizes`, `competes-with`,
`part-of`; each maps to an arrow style in `model.json`. `label` is the words shown on the edge, read as
"from *label* to", e.g. "Pretraining data *teaches* next-token prediction". Concepts don't store their own related
lists; they're derived from this file so maps and links never drift apart.

## Flows (Z1)

`flows.json` holds two step-through flows shown on the stack:

- `request` (`direction: "down"`): a question travelling from the app to the chips. Steps must move strictly down,
  one layer at a time; `bypass: true` marks a layer the request skips (Data), drawn dashed.
- `capability` (`direction: "up"`): how each layer builds on the one below. Steps must move strictly up.

Each flow may have an `intro` and `outro` (`{ anchor: "top" | "bottom" | layerId, text, dir? }`); `top` is the
"People" cap above the stack and `bottom` the foundation below it. The validator enforces direction and ordering.
Every step is deep-linkable: `#/stack?flow=request&step=4`.

## Diagrams

Diagrams are generated from specs so they stay consistent and update with the data:
`flow` (optionally `numbered`, with a `loop`), `stack`, `hub`, `bars`, `compare`, `sequence`, and `guess` (a prompt
with candidate next words sized by how likely they are; D1). Every diagram gets an automatic text alternative for
screen readers. The validator rejects types that `site/next/diagrams.js` doesn't render.

## Accuracy rules

- Never invent figures, market data or benchmarks. Use the literal string `PLACEHOLDER`; it renders as a visible
  marker and appears in the report.
- Name real products only in `examples` or dashboard `players`, not in core explanations.
- Draft content keeps `status: "draft"` until reviewed. Anything older than `staleAfterDays` is flagged on the page.

## Checks

```bash
python3 scripts/validate_content.py            # schema, references, depth rules, icons, explorable and diagram ids, WCAG AA contrast
python3 scripts/validate_content.py --report   # placeholders to fill, sources to verify, drafts to review
```

CI runs both on every push and pull request.
