import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SavedMemorialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.user_page = (ROOT / "vartotojas.html").read_text(encoding="utf-8")
        cls.memorial_page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        cls.saved = (ROOT / "assets" / "saved-memorials.js").read_text(encoding="utf-8")
        cls.actions = (ROOT / "assets" / "memorial-actions.js").read_text(encoding="utf-8")

    def test_client_zone_exposes_device_local_saved_memorials(self):
        self.assertIn('id="issaugoti-atminimai"', self.user_page)
        self.assertIn("Išsaugoti atminimo puslapiai", self.user_page)
        self.assertIn('data-saved-memorials-list aria-live="polite"', self.user_page)
        self.assertIn('src="assets/saved-memorials.js', self.user_page)

    def test_saved_links_are_same_origin_memorial_pages_only(self):
        self.assertIn("parsed.origin !== window.location.origin", self.saved)
        self.assertIn('page !== "sablonas-viskas.html"', self.saved)
        self.assertIn('parsed.searchParams.get("slug")', self.saved)
        self.assertNotIn("innerHTML", self.saved)

    def test_saved_items_can_be_opened_shared_reminded_and_removed(self):
        for action in ('"share"', '"reminder"', '"remove"'):
            self.assertIn(action, self.saved)
        self.assertIn("navigator.share", self.saved)
        self.assertIn("BEGIN:VCALENDAR", self.saved)
        self.assertIn('window.addEventListener("storage"', self.saved)

    def test_memorial_save_action_is_accessible_and_discoverable(self):
        self.assertIn('href="vartotojas.html#issaugoti-atminimai"', self.memorial_page)
        self.assertIn('button.setAttribute("aria-pressed", String(saved))', self.actions)
        self.assertIn("Išsaugoti atminimai", self.actions)


if __name__ == "__main__":
    unittest.main()
