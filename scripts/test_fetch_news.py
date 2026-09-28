"""Offline tests for fetch_news.py. Run: python3 -m unittest discover scripts"""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

import fetch_news as fn

HERE = Path(__file__).resolve().parent
NOW = dt.datetime(2026, 9, 27, 12, 0, tzinfo=dt.timezone.utc)


class ConceptMapTests(unittest.TestCase):
    def test_related_ids_exist_and_ids_unique(self):
        concepts = json.loads((fn.DATA / "concepts.json").read_text())
        ids = [i["id"] for L in concepts["layers"] for c in L["categories"] for i in c["items"]]
        self.assertEqual(len(ids), len(set(ids)), "duplicate concept ids")
        known = set(ids)
        for L in concepts["layers"]:
            for c in L["categories"]:
                for i in c["items"]:
                    for r in i.get("related", []):
                        self.assertIn(r, known, f"{i['id']} -> unknown related id {r}")

    def test_strata_model_layers(self):
        concepts = json.loads((fn.DATA / "concepts.json").read_text())
        known = {i["id"] for L in concepts["layers"] for c in L["categories"] for i in c["items"]}
        layers = [L for L in concepts["layers"] if not L.get("pillar")]
        self.assertEqual(sorted(L["num"] for L in layers), list(range(1, 8)), "exactly seven numbered layers")
        layer_ids = {L["id"] for L in concepts["layers"]}
        for L in layers:
            for key in ("osi", "moves", "plain", "icon"):
                self.assertTrue(L.get(key), f"{L['id']} missing {key}")
            self.assertGreaterEqual(len(L.get("threats", [])), 2, f"{L['id']} needs threats")
            for t in L.get("tech", []):
                self.assertIn(t, known, f"{L['id']} tech -> {t}")
            for th in L["threats"]:
                for key in ("name", "what", "example", "defense"):
                    self.assertTrue(th.get(key), f"{L['id']} threat missing {key}")
                if th.get("concept"):
                    self.assertIn(th["concept"], known, f"{L['id']} threat -> {th['concept']}")
        for step in concepts.get("journey", []):
            self.assertIn(step["layer"], layer_ids)

    def test_source_tags_exist(self):
        concepts = json.loads((fn.DATA / "concepts.json").read_text())
        known = {i["id"] for L in concepts["layers"] for c in L["categories"] for i in c["items"]}
        for s in json.loads((fn.DATA / "sources.json").read_text())["sources"]:
            for t in s.get("tags", []):
                self.assertIn(t, known)


class TaggerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagger = fn.Tagger(json.loads((fn.DATA / "concepts.json").read_text()))

    def test_word_boundaries_and_case(self):
        self.assertIn("mcp", self.tagger.tag("New MCP server for Postgres"))
        self.assertNotIn("mcp", self.tagger.tag("the mcpherson report"))
        self.assertIn("llama-cpp", self.tagger.tag("llama.cpp adds Vulkan backend"))
        self.assertIn("dgx-spark", self.tagger.tag("Benchmarks on DGX Spark"))
        self.assertIn("openrouter", self.tagger.tag("Now on OpenRouter"))

    def test_plurals_hyphens_and_regex_keywords(self):
        self.assertIn("computer-use", self.tagger.tag("Holo4: powering generalist computer-use agents"))
        self.assertIn("mcp", self.tagger.tag("Five MCPs worth installing"))
        self.assertIn("moe", self.tagger.tag("Naive-N0.5-Flash - 309B-A15.5B"))

    def test_known_terms_include_keyword_words(self):
        self.assertTrue(self.tagger.is_known("Hugging"))
        self.assertFalse(self.tagger.is_known("Zephyrix-7"))

    def test_paths_reference_real_concepts(self):
        concepts = json.loads((fn.DATA / "concepts.json").read_text())
        known = {i["id"] for L in concepts["layers"] for c in L["categories"] for i in c["items"]}
        for path in concepts.get("paths", []):
            for step in path["steps"]:
                self.assertIn(step, known, f"path {path['id']} -> {step}")

    def test_case_sensitive_keywords(self):
        self.assertIn("rag", self.tagger.tag("Better RAG pipelines"))
        self.assertNotIn("rag", self.tagger.tag("a rag and bone man"))


class ParsingTests(unittest.TestCase):
    def test_atom_prefers_published(self):
        entries = fn.parse_feed((HERE / "fixtures" / "simonw.xml").read_bytes())
        self.assertEqual(entries[0]["date"], dt.datetime(2026, 9, 26, 11, tzinfo=dt.timezone.utc))
        self.assertEqual(entries[0]["link"], "https://simonwillison.net/2026/Sep/26/openclaw/")

    def test_rejects_entity_declarations(self):
        evil = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa">]><rss><channel><item><title>&a;</title></item></channel></rss>'
        with self.assertRaises(ValueError):
            fn.parse_feed(evil)

    def test_normalize_strips_tracking(self):
        self.assertEqual(fn.item_id("https://example.com/spark-qwen?utm_source=hn"),
                         fn.item_id("https://example.com/spark-qwen/"))


class EndToEndTests(unittest.TestCase):
    def test_run_with_fixtures(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "news.json"
            data = fn.run(HERE / "fixtures", out, now=NOW)
            titles = [i["title"] for i in data["items"]]
            by_title = {i["title"]: i for i in data["items"]}

            self.assertNotIn("My favourite sourdough recipe", titles, "AI filter should drop off-topic HN")
            self.assertNotIn("Old post", titles, "retention should drop old items")
            spark = by_title["Running Qwen3.5 MoE on a DGX Spark at 40 tok/s"]
            self.assertEqual(spark["points"], 412)
            self.assertIn("dgx-spark", spark["tags"])
            self.assertIn("compute", spark["layers"])
            self.assertEqual(spark["discussion"], "https://news.ycombinator.com/item?id=1")

            arxiv = by_title["Abliteration Revisited"]
            self.assertTrue(arxiv["summary"].startswith("We study"))
            self.assertIn("abliteration", arxiv["tags"])

            papers = [i for i in data["items"] if i["source"] == "hf-papers"]
            self.assertEqual(len(papers), 2)

            self.assertGreater(data["heat"]["concepts"]["dgx-spark"]["d7"], 0)
            self.assertIn("Zephyrix-7", [r["term"] for r in data["radar"]])

            feed = (Path(tmp) / "feed.xml").read_text()
            self.assertIn("urn:strata:" + spark["id"], feed)
            self.assertIn('term="dgx-spark"', feed)

            health = {s["id"]: s for s in data["sources"]}
            self.assertTrue(health["hn"]["ok"])
            self.assertFalse(health["openai"]["ok"])

            # second run keeps items and firstSeen, no duplicates
            first_seen = spark["firstSeen"]
            data2 = fn.run(HERE / "fixtures", out, now=NOW + dt.timedelta(hours=4))
            self.assertEqual(len(data2["items"]), len(data["items"]))
            again = {i["id"]: i for i in data2["items"]}[spark["id"]]
            self.assertEqual(again["firstSeen"], first_seen)


if __name__ == "__main__":
    unittest.main()
