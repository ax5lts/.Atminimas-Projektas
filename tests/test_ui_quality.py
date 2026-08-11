import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def relative_luminance(color):
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    channels = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast_ratio(first, second):
    lighter, darker = sorted((relative_luminance(first), relative_luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


class UiQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        cls.loading = (ROOT / "assets" / "loading.js").read_text(encoding="utf-8")
        cls.graves = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        cls.site_ui = (ROOT / "assets" / "site-ui.js").read_text(encoding="utf-8")
        cls.user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")

    def test_skeletons_are_structural_and_accessibility_safe(self):
        self.assertIn("window.AtminimasLoading", self.loading)
        self.assertIn("class='skeleton-card'", self.loading)
        self.assertIn("aria-hidden='true'", self.loading)
        self.assertIn('container.setAttribute("aria-busy", "true")', self.loading)
        self.assertIn("AtminimasLoading.cards(3)", self.graves)
        self.assertIn(".skeleton-media", self.styles)
        self.assertIn("prefers-reduced-motion: reduce", self.styles)

    def test_semantic_status_palette_meets_text_contrast(self):
        pairs = (
            ("status-info", "status-info-soft"),
            ("status-success", "status-success-soft"),
            ("status-warning", "status-warning-soft"),
            ("status-danger", "status-danger-soft"),
        )
        values = dict(re.findall(r"--(status-[a-z-]+):\s*(#[0-9a-fA-F]{6})", self.styles))
        for foreground, background in pairs:
            with self.subTest(status=foreground):
                self.assertGreaterEqual(contrast_ratio(values[foreground], values[background]), 4.5)
        self.assertIn('.form-status[data-state="warning"]', self.styles)
        self.assertIn('status.dataset.state = "error"', self.graves)
        self.assertIn('setStatus("Kraunama jūsų kliento zona…", "loading")', self.user)
        self.assertIn("--focus-ring: #1a6d62", self.styles)
        self.assertIn(".editor-form :where(input, select, textarea):focus-visible", self.styles)

    def test_mobile_ui_uses_one_primary_navigation_and_progressive_actions(self):
        self.assertIn('document.body.classList.contains("has-mobile-dock")', self.site_ui)
        self.assertLess(self.site_ui.index("setupMobileDock();"), self.site_ui.index("setupHeaderMenu();", self.site_ui.index("setupMobileDock();")))
        self.assertIn("body.has-mobile-dock .site-header .site-nav", self.styles)
        self.assertIn("details:not([open]) > :not(summary)", self.styles)
        self.assertIn("<details class='grave-result-more'>", self.graves)
        self.assertIn("Kiti veiksmai", self.graves)

    def test_static_navigation_and_images_have_accessible_names(self):
        for page in ROOT.glob("*.html"):
            markup = page.read_text(encoding="utf-8")
            with self.subTest(page=page.name):
                for nav in re.findall(r"<nav\b[^>]*>", markup, flags=re.I):
                    self.assertRegex(nav, r"\baria-label=")
                for image in re.findall(r"<img\b[^>]*>", markup, flags=re.I):
                    self.assertRegex(image, r"\balt=")

    def test_search_busy_state_and_status_are_exposed(self):
        for page_name in ("index.html", "kapu-ieskojimas.html"):
            markup = (ROOT / page_name).read_text(encoding="utf-8")
            with self.subTest(page=page_name):
                self.assertRegex(markup, r"data-grave-results[^>]*aria-busy=\"false\"")
                self.assertRegex(markup, r"data-grave-status[^>]*role=\"status\"")


if __name__ == "__main__":
    unittest.main()
