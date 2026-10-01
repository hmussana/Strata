#!/usr/bin/env python3
"""Print a markdown report of what the concept map is missing, for the weekly review issue."""
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "site" / "data"


def md(text: str) -> str:
    """Neutralise feed text before it lands in a GitHub issue: no @-mentions, links or HTML."""
    text = re.sub(r"[\[\]<>`*_|]", " ", str(text))
    return text.replace("@", "@\u200b").replace("#", "#\u200b").strip()


def safe_url(url: str) -> str:
    return url if re.match(r"^https?://[^\s()<>]+$", url or "") else ""


def main() -> None:
    news = json.loads((DATA / "news.json").read_text())
    concepts = json.loads((DATA / "concepts.json").read_text())
    items = {it["id"]: it for it in news.get("items", [])}
    names = {i["id"]: i["name"] for L in concepts["layers"] for c in L["categories"] for i in c["items"]}
    heat = news.get("heat", {}).get("concepts", {})

    out = [f"_Generated from the news feed of {news.get('generated') or 'never'}. "
           f"Concept map last reviewed {concepts.get('reviewed')}._", ""]

    out += ["## Trending but not on the map", ""]
    radar = news.get("radar", [])
    if not radar:
        out.append("Nothing unmapped is trending.")
    for r in radar:
        out.append(f"- [ ] **{md(r['term'])}** ({r['items']} stories, {r['sources']} sources)")
        for sid in r["sample"][:3]:
            it = items.get(sid)
            if it and safe_url(it["url"]):
                out.append(f"  - [{md(it['title'])}]({safe_url(it['url'])}) · {md(it['sourceName'])}")

    out += ["", "## Hottest mapped concepts (7 days)", ""]
    top = sorted(heat.items(), key=lambda kv: -kv[1].get("d7", 0))[:10]
    out += [f"- {names.get(cid, cid)}: {h['d7']} this week (prev {h['prev7']})" for cid, h in top if h.get("d7")]

    quiet = [names[c] for c in names if heat.get(c, {}).get("d30", 0) == 0]
    out += ["", "## Quiet for 30 days (check keywords or whether still relevant)", "",
            ", ".join(sorted(quiet)) or "None."]

    out += ["", "---", "To update: edit `site/data/concepts.json` (add items/keywords, bump `reviewed`), "
            "or add terms to `radarIgnore` if they are noise."]
    print("\n".join(out))


if __name__ == "__main__":
    main()
