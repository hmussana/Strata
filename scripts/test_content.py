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

    def test_report_lists_placeholders(self):
        rep = vc.report(self.data)
        self.assertIn("dashboard.json", rep)
        self.assertIn("investment.value", rep)
        self.assertIn("Drafts awaiting review", rep)

if __name__ == "__main__":
    unittest.main()
