"""Content checks for The AI Stack. Run: python3 -m unittest discover -s scripts"""
import unittest

import validate_content as vc


class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = vc.load_all()

    def test_content_is_valid(self):
        self.assertEqual(vc.validate(self.data), [])

    def test_contrast_helper(self):
        self.assertAlmostEqual(vc.contrast("#000000", "#ffffff"), 21.0, places=1)
        self.assertAlmostEqual(vc.contrast("#777777", "#ffffff"), 4.48, places=2)

    def test_validator_catches_missing_breaks(self):
        data = vc.load_all()
        d2 = data["concepts"][0]["depths"]["D2"]
        d2["analogy"], d2["analogyBreaks"] = "x", ""
        self.assertTrue(any("analogyBreaks" in e for e in vc.validate(data)))

    def test_maturity_must_match_formula(self):
        data = vc.load_all()
        entry = data["dashboard"]["layers"]["agents"]["maturity"]
        entry["value"] += 10
        self.assertTrue(any("doesn't match the formula" in e for e in vc.validate(data)))

    def test_unknown_interactive_and_diagram_are_rejected(self):
        data = vc.load_all()
        d2 = data["concepts"][0]["depths"]["D2"]
        d2["interactive"] = "no-such-explorable"
        d2["diagram"] = {"type": "no-such-diagram"}
        errs = vc.validate(data)
        self.assertTrue(any("unknown interactive" in e for e in errs))
        self.assertTrue(any("unknown diagram type" in e for e in errs))

    def test_registries_are_read_from_code(self):
        self.assertIn("sampling-play", vc.explorable_ids())
        self.assertIn("guess", vc.diagram_types())

    def test_report_lists_placeholders(self):
        rep = vc.report(self.data)
        self.assertIn("crosscutting.json", rep)
        self.assertIn("Drafts awaiting review", rep)

if __name__ == "__main__":
    unittest.main()
