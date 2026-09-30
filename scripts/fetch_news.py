#!/usr/bin/env python3
"""Pull AI news from RSS/Atom/JSON sources, tag each story against the concept map,
and write site/data/news.json for the static site.

Standard library only, so the GitHub Action needs no dependencies.

Optional LLM enrichment (one-line summaries + better tags) runs when these env vars are set,
against any OpenAI-compatible endpoint (OpenRouter, LiteLLM, Ollama, llama.cpp server, ...):
    LLM_BASE_URL   e.g. https://openrouter.ai/api/v1  or  http://localhost:11434/v1
    LLM_MODEL      model id understood by that endpoint
    LLM_API_KEY    optional for local servers
    LLM_MAX_ITEMS  max new stories enriched per run (default 40)
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
USER_AGENT = "Mozilla/5.0 (compatible; strata-newsboard/1.0; +https://github.com/hmussana/Strata)"
SITE_URL = (os.environ.get("SITE_URL") or "https://hmussana.github.io/Strata/").rstrip("/") + "/"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
FEED_ITEMS = 60
RETENTION_DAYS = 45
MAX_ITEMS = 900
MAX_TAGS = 6
SUMMARY_CHARS = 320

AI_RE = re.compile(
    r"\b(AI|A\.I\.|LLMs?|GPT[\w.-]*|genAI|agents?|agentic|models?|inference|transformers?|neural|"
    r"machine learning|deep learning|Claude|Gemini|OpenAI|Anthropic|Llama|Qwen|DeepSeek|Mistral|"
    r"CUDA|GPUs?|diffusion|chatbots?|copilot)\b",
    re.I,
)
TRACKING_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"}


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(d: dt.datetime) -> str:
    return d.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_date(text: str | None) -> dt.datetime | None:
    if not text:
        return None
    text = text.strip()
    try:
        d = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError, IndexError):
        d = None
    if d is None:
        try:
            d = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc)


def strip_html(text: str | None, limit: int = SUMMARY_CHARS) -> str:
    if not text:
        return ""
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([.,;:!?)])", r"\1", text)
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:") + "…"
    return text


def normalize_url(url: str) -> str:
    try:
        parts = urllib.parse.urlsplit(url.strip())
    except ValueError:
        return url.strip()
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if k.lower() not in TRACKING_PARAMS]
    path = parts.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urllib.parse.urlencode(query), ""))


def item_id(url: str) -> str:
    return hashlib.sha1(normalize_url(url).encode()).hexdigest()[:12]


# ---------------------------------------------------------------- parsing

def _local(tag) -> str:
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def _text(el) -> str:
    return "".join(el.itertext()).strip()


def parse_feed(raw: bytes) -> list[dict]:
    """Parse RSS 2.0, RSS 1.0 (RDF) or Atom into raw entries."""
    if b"<!ENTITY" in raw[:65536]:  # feeds never need custom entities; refuse expansion tricks
        raise ValueError("feed declares XML entities")
    root = ET.fromstring(raw)
    return [_parse_entry(el) for el in root.iter() if _local(el.tag) in ("item", "entry")]


def _parse_entry(el) -> dict:
    entry = {"title": "", "link": "", "date": None, "summary": "", "comments": ""}
    dates: dict[str, str] = {}
    bodies: dict[str, str] = {}
    for ch in el:
        name = _local(ch.tag)
        if name == "title":
            entry["title"] = strip_html(_text(ch), 300)
        elif name == "link":
            href = ch.get("href")
            if href:
                if ch.get("rel", "alternate") == "alternate" or not entry["link"]:
                    entry["link"] = href
            elif _text(ch):
                entry["link"] = _text(ch)
        elif name in ("published", "pubdate", "issued", "date", "updated"):
            dates.setdefault(name, _text(ch))
        elif name in ("summary", "description", "content", "encoded"):
            bodies.setdefault(name, _text(ch))
        elif name == "comments":
            entry["comments"] = _text(ch)
    for key in ("published", "pubdate", "issued", "date", "updated"):
        if key in dates:
            entry["date"] = parse_date(dates[key])
            if entry["date"]:
                break
    for key in ("summary", "description", "encoded", "content"):
        if bodies.get(key):
            entry["summary"] = bodies[key]
            break
    return entry


def parse_hf_papers(raw: bytes) -> list[dict]:
    out = []
    for e in json.loads(raw):
        paper = e.get("paper", {})
        pid = paper.get("id")
        if not pid:
            continue
        out.append({
            "title": (e.get("title") or paper.get("title") or "").strip(),
            "link": f"https://huggingface.co/papers/{pid}",
            "date": parse_date(e.get("publishedAt") or paper.get("publishedAt")),
            "summary": paper.get("summary", ""),
            "comments": "",
            "points": paper.get("upvotes"),
        })
    out.sort(key=lambda x: x.get("points") or 0, reverse=True)
    return out


def clean_summary(source: dict, raw_summary: str) -> tuple[str, int | None]:
    points = None
    m = re.search(r"Points:\s*(\d+)", raw_summary or "")
    if m:
        points = int(m.group(1))
    text = raw_summary or ""
    if source["id"].startswith("arxiv"):
        text = re.sub(r"^.*?Abstract:\s*", "", strip_html(text, 2000))
    if source["id"] == "hn":
        text = ""  # hnrss descriptions are just metadata
    text = strip_html(text)
    text = re.sub(r"\s*submitted by /u/\S+.*$", "", text)  # reddit footer
    text = re.sub(r"\s*\[?(?:link|comments)\]?\s*$", "", text)
    text = re.sub(r"https?://\S+", "", text)  # bare URLs are noise in a snippet
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text, points


# ---------------------------------------------------------------- tagging

class Tagger:
    def __init__(self, concepts: dict):
        self.concept_layer: dict[str, str] = {}
        self.concept_name: dict[str, str] = {}
        self.patterns: dict[str, re.Pattern] = {}
        self.keyword_words: set[str] = set()
        for layer in concepts["layers"]:
            for cat in layer["categories"]:
                for item in cat["items"]:
                    self.concept_layer[item["id"]] = layer["id"]
                    self.concept_name[item["id"]] = item["name"]
                    for kw in item.get("keywords", []):
                        if kw.startswith("~"):
                            continue
                        self.keyword_words.update(w.lower() for w in kw.lstrip("=").split())
                    pat = self._compile(item.get("keywords", []))
                    if pat:
                        self.patterns[item["id"]] = pat

    @staticmethod
    def _compile(keywords: list[str]) -> re.Pattern | None:
        sensitive = [k[1:] for k in keywords if k.startswith("=")]
        insensitive = [k for k in keywords if k[:1] not in ("=", "~")]
        parts = [f"(?i:{k[1:]})" for k in keywords if k.startswith("~")]  # raw regex
        for group, flag in ((insensitive, "(?i:"), (sensitive, "(?:")):
            if group:
                alts = "|".join(re.escape(k).replace(r"\ ", r"[\s-]+")
                                for k in sorted(group, key=len, reverse=True))
                parts.append(f"{flag}{alts})")
        if not parts:
            return None
        return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(parts) + r")s?(?![A-Za-z0-9])")

    def tag(self, title: str, summary: str = "") -> list[str]:
        """Concepts named in the title rank first; summary-only mentions add at most two more."""
        in_title, in_summary = [], []
        for cid, pat in self.patterns.items():
            n = len(pat.findall(title))
            if n:
                in_title.append((n, cid))
            elif summary:
                m = len(pat.findall(summary))
                if m:
                    in_summary.append((m, cid))
        in_title.sort(key=lambda x: -x[0])
        in_summary.sort(key=lambda x: -x[0])
        tags = [c for _, c in in_title] + [c for _, c in in_summary[:2]]
        return tags[:MAX_TAGS]

    def is_known(self, term: str) -> bool:
        """True if the term is matched by, or is one word of, a mapped keyword."""
        if any(p.search(term) for p in self.patterns.values()):
            return True
        return " " not in term and term.lower() in self.keyword_words


# ---------------------------------------------------------------- fetching

def http_get(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, application/json;q=0.9, */*;q=0.5",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("response too large")
    return body


def fetch_source(source: dict, fixtures: Path | None) -> tuple[dict, list[dict], str | None]:
    try:
        if fixtures is not None:
            path = next(fixtures.glob(source["id"] + ".*"), None)
            if path is None:
                return source, [], "no fixture"
            raw = path.read_bytes()
        else:
            raw = http_get(source["url"])
        entries = parse_hf_papers(raw) if source.get("format") == "hf-papers" else parse_feed(raw)
        return source, entries, None
    except Exception as exc:  # noqa: BLE001 - one bad feed must never break the run
        return source, [], f"{type(exc).__name__}: {exc}"[:200]


def build_items(source: dict, entries: list[dict], tagger: Tagger, now: dt.datetime,
                drop: re.Pattern | None = None) -> list[dict]:
    if source.get("format") != "hf-papers":
        entries = sorted(entries, key=lambda e: e["date"] or now, reverse=True)
    items = []
    for e in entries:
        if not e["title"] or not e["link"]:
            continue
        summary, points = clean_summary(source, e["summary"])
        points = e.get("points", points)
        text = f"{e['title']} {summary}"
        if source.get("filter") == "ai" and not (AI_RE.search(text) or tagger.tag(text)):
            continue
        if drop and drop.search(e["title"]):
            continue
        published = min(e["date"] or now, now)
        item = {
            "id": item_id(e["link"]),
            "title": e["title"],
            "url": e["link"],
            "source": source["id"],
            "sourceName": source["name"],
            "type": source["type"],
            "published": iso(published),
            "summary": summary,
        }
        if points is not None:
            item["points"] = points
        if e.get("comments") and e["comments"] != e["link"]:
            item["discussion"] = e["comments"]
        items.append(item)
        if len(items) >= source.get("limit", 15):
            break
    return items


# ---------------------------------------------------------------- enrichment

def retag(items: list[dict], tagger: Tagger, sources: dict[str, dict]) -> None:
    for it in items:
        if "http" in it.get("summary", ""):
            it["summary"] = re.sub(r"\s{2,}", " ", re.sub(r"https?://\S+", "", it["summary"])).strip()
        tags = tagger.tag(it["title"], it.get("summary", ""))
        for forced in sources.get(it["source"], {}).get("tags", []):
            if forced not in tags:
                tags.insert(0, forced)
        for extra in it.get("llm", {}).get("tags", []):
            if extra not in tags and extra in tagger.concept_layer:
                tags.append(extra)
        it["tags"] = tags[:MAX_TAGS]
        it["layers"] = sorted({tagger.concept_layer[t] for t in it["tags"] if t in tagger.concept_layer})
        weight = sources.get(it["source"], {}).get("weight", 1)
        pts = it.get("points") or 0
        it["score"] = round(weight + 0.6 * min(len(it["tags"]), 4) + (math.log10(pts + 1) if pts else 0), 2)


def llm_enrich(items: list[dict], tagger: Tagger) -> int:
    base = os.environ.get("LLM_BASE_URL", "").rstrip("/")
    model = os.environ.get("LLM_MODEL", "")
    if not base or not model:
        return 0
    key = os.environ.get("LLM_API_KEY", "")
    budget = int(os.environ.get("LLM_MAX_ITEMS", "40"))
    todo = [it for it in items if "llm" not in it][:budget]
    catalog = "\n".join(f"{cid}: {name}" for cid, name in tagger.concept_name.items())
    done = 0
    for start in range(0, len(todo), 10):
        batch = todo[start:start + 10]
        listing = "\n".join(f"[{i}] {it['title']} :: {it.get('summary', '')[:300]}" for i, it in enumerate(batch))
        prompt = (
            "You tag AI/LLM news for a learning dashboard. Concept ids:\n" + catalog +
            "\n\nFor each story return an object {\"i\": index, \"summary\": one plain sentence (max 30 words) "
            "explaining what happened and why it matters, \"tags\": up to 4 concept ids from the list}. "
            "Reply with only a JSON array.\n\nStories:\n" + listing
        )
        body = json.dumps({"model": model, "temperature": 0.2,
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        try:
            req = urllib.request.Request(base + "/chat/completions", data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                content = json.loads(resp.read())["choices"][0]["message"]["content"]
            match = re.search(r"\[.*\]", content, re.S)
            results = json.loads(match.group(0)) if match else []
        except Exception as exc:  # noqa: BLE001
            print(f"  llm batch failed: {exc}", file=sys.stderr)
            continue
        for r in results:
            try:
                it = batch[int(r["i"])]
            except (KeyError, ValueError, IndexError, TypeError):
                continue
            tags = [t for t in r.get("tags", []) if t in tagger.concept_layer][:4]
            it["llm"] = {"summary": strip_html(str(r.get("summary", "")), 240), "tags": tags}
            done += 1
    return done


# ---------------------------------------------------------------- analytics

def stack_patterns(content: Path | None = None) -> dict[str, re.Pattern | None]:
    """Compiled keyword pattern per layer of The AI Stack (site/content), in layer order."""
    content = content or ROOT / "site" / "content"
    model_path = content / "model.json"
    if not model_path.exists():
        return {}
    out = {}
    for lid in json.loads(model_path.read_text())["layers"]:
        layer = json.loads((content / "layers" / f"{lid}.json").read_text())
        out[lid] = Tagger._compile(layer.get("newsKeywords", []))
    return out


def compute_stack_heat(items: list[dict], now: dt.datetime, content: Path | None = None) -> dict:
    """Stories per layer of The AI Stack, this week and last week, from each layer's newsKeywords."""
    heat = {}
    for lid, pat in stack_patterns(content).items():
        counts = {"d7": 0, "prev7": 0}
        if pat:
            for it in items:
                age = (now - parse_date(it["published"])).total_seconds() / 86400
                if age <= 14 and pat.search(f"{it['title']} {it.get('summary', '')}"):
                    counts["d7" if age <= 7 else "prev7"] += 1
        heat[lid] = counts
    return heat


def compute_heat(items: list[dict], now: dt.datetime) -> dict:
    concepts: dict[str, dict] = defaultdict(lambda: {"d7": 0, "prev7": 0, "d30": 0})
    layers: dict[str, dict] = defaultdict(lambda: {"d7": 0, "d30": 0})
    for it in items:
        age = (now - parse_date(it["published"])).total_seconds() / 86400
        for t in it["tags"]:
            if age <= 7:
                concepts[t]["d7"] += 1
            elif age <= 14:
                concepts[t]["prev7"] += 1
            if age <= 30:
                concepts[t]["d30"] += 1
        for layer in it["layers"]:
            if age <= 7:
                layers[layer]["d7"] += 1
            if age <= 30:
                layers[layer]["d30"] += 1
    return {"concepts": dict(concepts), "layers": dict(layers)}


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[.\-+][A-Za-z0-9]+)*\+?")
STOP = set("""
a an the and or but for nor of on in at to by with from as into over under about after before this that these those
is are was were be been being it its it's we you they he she i our your their his her new how why what when where who
which will can could should would may might must just now today week year says said say gets get make makes made more
most less first last next top best vs via using use used your ai llm llms model models open source launches launch
releases release introducing introduces announces update updates show hn ask tell here there than then also not no yes
all any some one two three four five six seven eight nine ten way ways part inside behind meet big small free paper
january february march april may june july august september october november december monday tuesday wednesday thursday
friday saturday sunday us uk eu ceo cto api apis app apps faster better cheaper good bad state report guide
""".split())


def compute_radar(items: list[dict], tagger: Tagger, ignore: set[str], now: dt.datetime) -> list[dict]:
    """Find trending proper-noun-ish terms that the concept map doesn't know yet."""
    cap_mid: Counter = Counter()
    lower_seen: set[str] = set()
    term_items: dict[str, set] = defaultdict(set)
    term_sources: dict[str, set] = defaultdict(set)
    display: dict[str, Counter] = defaultdict(Counter)
    recent = [it for it in items if (now - parse_date(it["published"])).days <= 14]

    def distinctive(tok: str) -> bool:
        return any(c.isdigit() for c in tok) or any(c.isupper() for c in tok[1:])

    for it in recent:
        for field in (it["title"], it.get("summary", "")):
            for sentence in re.split(r"(?<=[.!?:])\s+|\s+[-–—|]\s+", field):
                toks = TOKEN_RE.findall(sentence)
                terms = []
                run: list[str] = []
                for pos, tok in enumerate(toks):
                    low = tok.lower()
                    if tok[0].islower():
                        lower_seen.add(low)
                    proper = tok[0].isupper() and low not in STOP and len(tok) > 1
                    if proper and pos > 0:
                        cap_mid[low] += 1
                    if proper and (pos > 0 or distinctive(tok)):
                        run.append(tok)
                        terms.append(tok)
                    else:
                        if len(run) >= 2:
                            terms.append(" ".join(run[:3]))
                        run = []
                if len(run) >= 2:
                    terms.append(" ".join(run[:3]))
                for term in set(terms):
                    key = term.lower()
                    term_items[key].add(it["id"])
                    term_sources[key].add(it["source"])
                    display[key][term] += 1

    radar = []
    for key, ids in term_items.items():
        words = key.split()
        if len(term_sources[key]) < 2 or key in ignore or any(w in ignore for w in words):
            continue
        single = len(words) == 1
        tok = display[key].most_common(1)[0][0]
        if single and not distinctive(tok) and (key in lower_seen or cap_mid[key] < 2 or len(term_sources[key]) < 3):
            continue
        if tagger.is_known(tok):
            continue
        radar.append({"term": tok, "items": len(ids), "sources": len(term_sources[key]),
                      "sample": sorted(ids)[:6]})
    radar.sort(key=lambda r: (r["sources"] * 2 + r["items"], len(r["term"].split())), reverse=True)
    # drop single words already covered by a stronger multi-word term
    kept: list[dict] = []
    for r in radar:
        low = r["term"].lower()
        if any(low in k["term"].lower().split() and k["items"] >= r["items"] * 0.6 for k in kept):
            continue
        kept.append(r)
    return kept[:24]


# ---------------------------------------------------------------- research signal (arXiv)

ARXIV_CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.DC", "cs.AR"]
RESEARCH_KEEP_DAYS = 30


def fetch_research(fixtures: Path | None) -> tuple[dict[str, str], str | None, list[str]]:
    """Today's new arXiv announcements across categories: {paper id: title + abstract}, announcement day, errors.
    Cross-listed papers appear in several category feeds and are counted once; replacements are skipped."""
    papers: dict[str, str] = {}
    day, errors = None, []
    for cat in ARXIV_CATEGORIES:
        try:
            if fixtures is not None:
                path = fixtures / f"arxiv-research-{cat}.xml"
                if not path.exists():
                    continue
                raw = path.read_bytes()
            else:
                raw = http_get(f"https://rss.arxiv.org/rss/{cat}")
            if b"<!ENTITY" in raw[:65536]:
                raise ValueError("feed declares XML entities")
            root = ET.fromstring(raw)
            for el in root.iter():
                if _local(el.tag) in ("pubdate", "lastbuilddate") and not day:
                    d = parse_date(_text(el))
                    day = d.date().isoformat() if d else None
                if _local(el.tag) != "item":
                    continue
                fields = {_local(ch.tag): _text(ch) for ch in el}
                announce = fields.get("announce_type") or (re.search(r"Announce Type:\s*([\w-]+)", fields.get("description", "")) or [None, ""])[1]
                if announce.startswith("replace"):
                    continue
                m = re.search(r"(\d{4}\.\d{4,5})", fields.get("link", "") + " " + fields.get("guid", ""))
                if m:
                    abstract = re.sub(r"^.*?Abstract:\s*", "", strip_html(fields.get("description", ""), 4000))
                    papers[m.group(1)] = f"{fields.get('title', '')} {abstract}"
        except Exception as exc:  # noqa: BLE001 - research is optional; keep previous data on failure
            errors.append(f"{cat}: {type(exc).__name__}: {exc}"[:160])
    return papers, day, errors


def update_research(previous: dict | None, papers: dict[str, str], day: str | None, now: dt.datetime,
                    errors: list[str], content: Path | None = None) -> dict:
    research = {"daily": {}, **(previous or {})}
    daily = dict(research.get("daily", {}))
    if papers:  # arXiv publishes nothing at weekends; don't record empty days
        key = day or now.date().isoformat()
        counts = {lid: (sum(1 for text in papers.values() if pat.search(text)) if pat else 0)
                  for lid, pat in stack_patterns(content).items()}
        daily[key] = {"papers": len(papers), "layers": counts}
    cutoff = (now - dt.timedelta(days=RESEARCH_KEEP_DAYS)).date().isoformat()
    daily = {k: v for k, v in sorted(daily.items()) if k >= cutoff}
    week = (now - dt.timedelta(days=7)).date().isoformat()
    d7: dict[str, int] = defaultdict(int)
    for k, v in daily.items():
        if k > week:
            for lid, n in v["layers"].items():
                d7[lid] += n
    return {"categories": ARXIV_CATEGORIES, "daily": daily, "d7": dict(d7),
            "since": min(daily) if daily else None, "errors": errors}


# ---------------------------------------------------------------- atom feed

def write_atom(items: list[dict], tagger: Tagger, path: Path, now: dt.datetime) -> None:
    """Publish the tagged stream as Atom so people can follow it in any feed reader."""
    ns = "http://www.w3.org/2005/Atom"
    ET.register_namespace("", ns)
    feed = ET.Element(f"{{{ns}}}feed")

    def sub(parent, tag, text=None, **attrs):
        el = ET.SubElement(parent, f"{{{ns}}}{tag}", attrs)
        if text is not None:
            el.text = text
        return el

    sub(feed, "title", "Strata: AI news, mapped to the stack")
    sub(feed, "subtitle", "Stories from labs, community, research and press, tagged by concept.")
    sub(feed, "id", SITE_URL)
    sub(feed, "link", href=SITE_URL)
    sub(feed, "link", rel="self", href=SITE_URL + "feed.xml")
    sub(feed, "updated", iso(now))
    sub(feed, "generator", "Strata")
    for it in [i for i in items if i.get("tags")][:FEED_ITEMS]:
        entry = sub(feed, "entry")
        sub(entry, "title", it["title"])
        sub(entry, "link", href=it["url"])
        sub(entry, "id", "urn:strata:" + it["id"])
        sub(entry, "updated", it["published"])
        author = sub(entry, "author")
        sub(author, "name", it["sourceName"])
        names = ", ".join(tagger.concept_name.get(t, t) for t in it["tags"])
        summary = it.get("llm", {}).get("summary") or it.get("summary") or ""
        sub(entry, "summary", f"{summary} [{names}]".strip())
        for t in it["tags"]:
            sub(entry, "category", term=t, label=tagger.concept_name.get(t, t))
    ET.ElementTree(feed).write(path, encoding="utf-8", xml_declaration=True)


# ---------------------------------------------------------------- main

def run(fixtures: Path | None = None, out_path: Path | None = None, now: dt.datetime | None = None,
        reindex: bool = False) -> dict:
    """Fetch, merge and write. With reindex=True, skip the network and only re-tag existing items."""
    now = now or now_utc()
    feed_path = out_path.with_name("feed.xml") if out_path else DATA.parent / "feed.xml"
    out_path = out_path or DATA / "news.json"
    concepts = json.loads((DATA / "concepts.json").read_text())
    source_file = json.loads((DATA / "sources.json").read_text())
    source_cfg = source_file["sources"]
    drop = re.compile("|".join(source_file["drop"]), re.I) if source_file.get("drop") else None
    sources = {s["id"]: s for s in source_cfg}
    tagger = Tagger(concepts)
    previous = json.loads(out_path.read_text()) if out_path.exists() else {}
    prev_items = {it["id"]: it for it in previous.get("items", [])}
    prev_health = {s["id"]: s for s in previous.get("sources", [])}

    if reindex:
        now = parse_date(previous.get("generated")) or now
        results = []
    else:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda s: fetch_source(s, fixtures), source_cfg))

    health = [] if not reindex else previous.get("sources", [])
    merged = dict(prev_items)
    for source, entries, error in results:
        fresh = build_items(source, entries, tagger, now, drop) if not error else []
        for it in fresh:
            old = merged.get(it["id"])
            if old:
                it["firstSeen"] = old.get("firstSeen", old["published"])
                if "llm" in old:
                    it["llm"] = old["llm"]
            else:
                it["firstSeen"] = iso(now)
            merged[it["id"]] = it
        ok = error is None
        health.append({
            "id": source["id"], "name": source["name"], "type": source["type"], "ok": ok,
            "count": len(fresh), "error": error,
            "lastOk": iso(now) if ok else prev_health.get(source["id"], {}).get("lastOk"),
        })
        print(f"{'ok ' if ok else 'ERR'} {source['id']:<18} {len(fresh):>3} {error or ''}", file=sys.stderr)

    cutoff = now - dt.timedelta(days=RETENTION_DAYS)
    items = [it for it in merged.values()
             if parse_date(it["published"]) >= cutoff and not (drop and drop.search(it["title"]))]
    items.sort(key=lambda it: it["published"], reverse=True)
    items = items[:MAX_ITEMS]

    enriched = 0 if reindex else llm_enrich(items, tagger)
    if reindex:
        research = previous.get("research")
    else:
        papers, day, research_errors = fetch_research(fixtures)
        research = update_research(previous.get("research"), papers, day, now, research_errors)
    retag(items, tagger, sources)
    ignore = {w.lower() for w in concepts.get("radarIgnore", [])}

    data = {
        "generated": iso(now),
        "retentionDays": RETENTION_DAYS,
        "llmEnriched": enriched,
        "sources": health,
        "heat": {**compute_heat(items, now), "stack": compute_stack_heat(items, now)},
        "collectedSince": min((it.get("firstSeen", it["published"]) for it in items), default=None),
        "research": research,
        "radar": compute_radar(items, tagger, ignore, now),
        "items": items,
    }
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    write_atom(items, tagger, feed_path, now)
    ok = sum(h["ok"] for h in health)
    print(f"wrote {len(items)} items, {ok}/{len(health)} sources ok, {enriched} llm-enriched", file=sys.stderr)
    return data


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fixtures", type=Path, help="read <source-id>.* files from this dir instead of the network")
    ap.add_argument("--out", type=Path, help="output path (default site/data/news.json)")
    ap.add_argument("--reindex", action="store_true",
                    help="no network: re-tag existing items after editing concepts.json or sources.json")
    args = ap.parse_args()
    data = run(args.fixtures, args.out, reindex=args.reindex)
    if not any(s["ok"] for s in data["sources"]):
        print("warning: every source failed; kept previous items", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
