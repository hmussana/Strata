#!/usr/bin/env python3
"""Validate The AI Stack content (site/content) and report what still needs a human.

    python3 scripts/validate_content.py            # errors only, non-zero exit if any
    python3 scripts/validate_content.py --report   # markdown report of placeholders, drafts, unverified sources

Standard library only. Also checks that colour tokens in site/next/next.css meet WCAG AA contrast
and that every icon referenced by content exists in site/next/icons.js.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "site" / "content"
APP = ROOT / "site" / "next"
PLACEHOLDER = "PLACEHOLDER"
REQUIRED_DEPTHS = ("D1", "D2", "D5")
ALL_DEPTHS = ("D1", "D2", "D3", "D4", "D5")
AA = 4.5


def load(rel: str):
    return json.loads((CONTENT / rel).read_text())


def load_all() -> dict:
    model = load("model.json")
    layers = [load(f"layers/{lid}.json") for lid in model["layers"]]
    concept_ids = [cid for layer in layers for cid in layer.get("concepts", [])]
    concepts = [load(f"concepts/{cid}.json") for cid in concept_ids if (CONTENT / f"concepts/{cid}.json").exists()]
    return {
        "model": model, "layers": layers, "concepts": concepts, "concept_ids": concept_ids,
        "relationships": load("relationships.json")["relationships"],
        "crosscutting": load("crosscutting.json")["crosscutting"],
        "flows": load("flows.json"),
        "dashboard": load("dashboard.json"),
    }


def is_placeholder(value) -> bool:
    return isinstance(value, str) and PLACEHOLDER in value


def valid_date(value) -> bool:
    if is_placeholder(value):
        return True
    try:
        dt.date.fromisoformat(value)
        return True
    except (TypeError, ValueError):
        return False


def valid_url(value) -> bool:
    return is_placeholder(value) or bool(re.match(r"^https?://[^\s<>\"']+$", value or ""))


# ---------------------------------------------------------------- design tokens

def css_blocks() -> dict[str, dict[str, str]]:
    css = (APP / "next.css").read_text()
    blocks = {}
    for name, pattern in (("light", r":root\s*\{(.*?)\}"), ("dark", r":root\[data-theme=\"dark\"\]\s*\{(.*?)\}")):
        m = re.search(pattern, css, re.S)
        if m:
            blocks[name] = dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b", m.group(1)))
    return blocks


def luminance(hex_color: str) -> float:
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def icon_names() -> set[str]:
    js = (APP / "icons.js").read_text()
    return set(re.findall(r"^\s{2}([a-z][\w-]*):\s*'", js, re.M))


# ---------------------------------------------------------------- validation

def validate(data: dict | None = None) -> list[str]:
    d = data or load_all()
    errors: list[str] = []
    err = errors.append
    model, layers, concepts = d["model"], d["layers"], d["concepts"]
    layer_ids = [l["id"] for l in layers]
    concept_by_id = {c["id"]: c for c in concepts}
    rel_types = model.get("relationshipTypes", {})
    arrows = model.get("arrows", {})
    icons = icon_names() if (APP / "icons.js").exists() else None
    tokens = css_blocks() if (APP / "next.css").exists() else {}

    # model
    for key in ("title", "layers", "depths", "zoomLevels", "arrows", "relationshipTypes", "lastReviewed"):
        if key not in model:
            err(f"model.json: missing {key}")
    for t, spec in rel_types.items():
        if spec.get("arrow") not in arrows:
            err(f"model.json: relationship type {t} uses unknown arrow {spec.get('arrow')}")
    if [x["id"] for x in model.get("depths", [])] != list(ALL_DEPTHS):
        err("model.json: depths must be D1..D5 in order")

    # layers
    if len(set(layer_ids)) != len(layer_ids):
        err("layers: duplicate ids")
    orders = sorted(l.get("order", 0) for l in layers)
    if orders != list(range(1, len(layers) + 1)):
        err(f"layers: order must be 1..{len(layers)} without gaps, got {orders}")
    for l in layers:
        where = f"layers/{l['id']}.json"
        for key in ("name", "order", "color", "icon", "oneLiner", "analogy", "examples", "givesAbove", "needsBelow",
                    "concepts", "metaDiagram", "walkthrough", "status", "lastReviewed"):
            if key not in l:
                err(f"{where}: missing {key}")
        if not l.get("analogy", {}).get("breaks"):
            err(f"{where}: analogy needs a 'breaks' note")
        if not 3 <= len(l.get("examples", [])) <= 5:
            err(f"{where}: needs 3-5 examples")
        if not valid_date(l.get("lastReviewed")):
            err(f"{where}: lastReviewed is not an ISO date")
        if icons is not None and l.get("icon") not in icons:
            err(f"{where}: unknown icon {l.get('icon')}")
        for theme, block in tokens.items():
            for suffix in ("", "-ink", "-soft"):
                if f"--{l.get('color')}{suffix}" not in block:
                    err(f"{where}: colour token --{l.get('color')}{suffix} missing in {theme} theme")
        for cid in l.get("concepts", []):
            c = concept_by_id.get(cid)
            if not c:
                err(f"{where}: concept {cid} has no file")
            elif c.get("layer") != l["id"]:
                err(f"{where}: concept {cid} belongs to layer {c.get('layer')}")
        for node in l.get("metaDiagram", {}).get("nodes", []):
            if node.get("concept") not in l.get("concepts", []):
                err(f"{where}: meta-diagram node {node.get('concept')} is not a concept of this layer")
        for i, step in enumerate(l.get("walkthrough", [])):
            if not step.get("title") or not step.get("text"):
                err(f"{where}: walkthrough step {i + 1} needs title and text")
            for h in step.get("highlight", []):
                if h not in concept_by_id:
                    err(f"{where}: walkthrough step {i + 1} highlights unknown concept {h}")

    # concepts
    if len(set(d["concept_ids"])) != len(d["concept_ids"]):
        err("concepts: a concept is listed in more than one layer")
    for c in concepts:
        where = f"concepts/{c['id']}.json"
        for key in ("layer", "name", "summary", "prerequisites", "depths", "sources", "status", "lastReviewed"):
            if key not in c:
                err(f"{where}: missing {key}")
        if not valid_date(c.get("lastReviewed")):
            err(f"{where}: lastReviewed is not an ISO date")
        for p in c.get("prerequisites", []):
            if p not in concept_by_id:
                err(f"{where}: unknown prerequisite {p}")
        depths = c.get("depths", {})
        for dep in REQUIRED_DEPTHS:
            if dep not in depths:
                err(f"{where}: required depth {dep} missing")
        for dep, body in depths.items():
            if dep not in ALL_DEPTHS:
                err(f"{where}: unknown depth {dep}")
                continue
            if not body.get("text"):
                err(f"{where}: {dep} needs text")
            if dep != "D1" and body.get("analogy") and not body.get("analogyBreaks"):
                err(f"{where}: {dep} analogy needs an analogyBreaks note (required from D2 up)")
            pr = body.get("predict")
            if pr:
                opts = pr.get("options", [])
                if not pr.get("question") or len(opts) < 2 or not pr.get("explanation"):
                    err(f"{where}: {dep} predict needs question, 2+ options and explanation")
                if not isinstance(pr.get("answer"), int) or not 0 <= pr["answer"] < len(opts):
                    err(f"{where}: {dep} predict answer index out of range")
        if not any(b.get("predict") for b in depths.values()):
            err(f"{where}: needs at least one predict-then-reveal prompt")
        if not c.get("sources"):
            err(f"{where}: needs at least one source (use {PLACEHOLDER} if unknown)")
        for s in c.get("sources", []):
            if not s.get("title") or not valid_url(s.get("url")) or not valid_date(s.get("date")) and not re.fullmatch(r"\d{4}|ongoing", str(s.get("date"))):
                err(f"{where}: source needs title, http(s) url and a date: {s}")

    # relationships
    seen = set()
    for r in d["relationships"]:
        key = (r.get("from"), r.get("to"), r.get("type"))
        for end in ("from", "to"):
            if r.get(end) not in concept_by_id:
                err(f"relationships: unknown concept {r.get(end)} in {r}")
        if r.get("type") not in rel_types:
            err(f"relationships: unknown type {r.get('type')}")
        if not r.get("label"):
            err(f"relationships: missing label in {r}")
        if key in seen:
            err(f"relationships: duplicate {key}")
        seen.add(key)

    # cross-cutting, flows, dashboard
    for cc in d["crosscutting"]:
        if icons is not None and cc.get("icon") not in icons:
            err(f"crosscutting: unknown icon {cc.get('icon')}")
    for name in ("request", "capability"):
        flow = d["flows"].get(name, {})
        if not flow.get("steps"):
            err(f"flows.json: {name} has no steps")
        for s in flow.get("steps", []):
            if s.get("layer") not in layer_ids:
                err(f"flows.json: {name} step references unknown layer {s.get('layer')}")
    dash = d["dashboard"]
    indicator_ids = {i["id"] for i in dash.get("indicators", [])}
    if not 3 <= len(indicator_ids) <= 6:
        err("dashboard.json: needs 3-6 indicators")
    for lid in layer_ids:
        if lid not in dash.get("layers", {}):
            err(f"dashboard.json: no entry for layer {lid}")

    # contrast (WCAG AA for text-bearing token pairs)
    for theme, t in tokens.items():
        pairs = [("--text", "--bg"), ("--text", "--surface"), ("--muted", "--bg"), ("--muted", "--surface"), ("--accent-ink", "--surface")]
        for l in layers:
            c = l.get("color")
            pairs += [(f"--{c}-ink", "--bg"), (f"--{c}-ink", "--surface"), (f"--{c}-ink", f"--{c}-soft")]
        pairs += [("--cc-ink", "--bg"), ("--cc-ink", "--cc-soft")]
        for fg, bg in pairs:
            if fg in t and bg in t:
                ratio = contrast(t[fg], t[bg])
                if ratio < AA:
                    err(f"next.css {theme}: {fg} on {bg} contrast {ratio:.2f} < {AA}")
    return errors


# ---------------------------------------------------------------- report

def walk(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    else:
        yield path, node


def report(d: dict) -> str:
    out = ["# The AI Stack: content review report", ""]
    files = {"model.json": d["model"], "dashboard.json": d["dashboard"], "flows.json": d["flows"]}
    files.update({f"layers/{l['id']}.json": l for l in d["layers"]})
    files.update({f"concepts/{c['id']}.json": c for c in d["concepts"]})
    out += ["## Placeholders to fill", ""]
    n = 0
    for name, data in files.items():
        for path, value in walk(data):
            if is_placeholder(value):
                out.append(f"- `{name}` → `{path}`")
                n += 1
    out += [f"", f"{n} placeholder values.", "", "## Sources marked 'verify'", ""]
    for c in d["concepts"]:
        for s in c.get("sources", []):
            if s.get("verify") and not is_placeholder(s.get("title")):
                out.append(f"- {c['name']}: [{s['title']}]({s['url']}) ({s['date']})")
    out += ["", "## Drafts awaiting review", ""]
    drafts = [f"layer: {l['name']}" for l in d["layers"] if l.get("status") == "draft"]
    drafts += [f"concept: {c['name']}" for c in d["concepts"] if c.get("status") == "draft"]
    out += [f"- {x}" for x in drafts] or ["None."]
    return "\n".join(out) + "\n"


def main() -> int:
    data = load_all()
    errors = validate(data)
    for e in errors:
        print(f"ERROR {e}", file=sys.stderr)
    if "--report" in sys.argv:
        print(report(data))
    print(f"{len(data['layers'])} layers, {len(data['concepts'])} concepts, {len(data['relationships'])} relationships, "
          f"{len(errors)} errors", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
