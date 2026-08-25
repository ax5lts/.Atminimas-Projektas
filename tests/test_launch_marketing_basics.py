import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LaunchMarketingBasicsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.site_ui = (ROOT / "assets" / "site-ui.js").read_text(encoding="utf-8")
        cls.analytics = (ROOT / "assets" / "analytics.js").read_text(encoding="utf-8")
        cls.seo = (ROOT / "assets" / "site-seo.js").read_text(encoding="utf-8")

    def test_custom_404_and_thank_you_pages_exist(self):
        error_page = (ROOT / "404.html").read_text(encoding="utf-8")
        thank_you = (ROOT / "aciu.html").read_text(encoding="utf-8")
        self.assertIn("Šio puslapio čia nėra", error_page)
        self.assertIn('meta name="robots" content="noindex,follow"', error_page)
        self.assertIn('id="thank-you-title"', thank_you)
        self.assertIn('src="assets/thank-you.js', thank_you)

    def test_service_success_and_product_preorder_mode_are_explicit(self):
        home_js = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        payment = (ROOT / "supabase" / "functions" / "payment-create" / "index.ts").read_text(encoding="utf-8")
        self.assertIn('window.location.assign("aciu.html?type=service")', home_js)
        self.assertIn("payment_enabled: false", payment)
        self.assertIn("preorder_url:", payment)
        self.assertNotIn("checkout.stripe.com", payment)

    def test_generated_breadcrumbs_cover_public_pages(self):
        self.assertIn("function setupBreadcrumbs()", self.site_ui)
        self.assertIn('"kapu-ieskojimas.html": "Kapų paieška"', self.site_ui)
        self.assertIn('"privatumas.html": "Privatumas"', self.site_ui)
        self.assertIn('setupBreadcrumbs();', self.site_ui)

    def test_home_has_six_faqs_and_response_promise(self):
        self.assertEqual(self.home.count('class="faq-item"'), 6)
        self.assertIn('id="faq-title"', self.home)
        self.assertIn('data-business="responseTime"', self.home)
        business = (ROOT / "assets" / "business-config.js").read_text(encoding="utf-8")
        self.assertIn('responseTime: "per 1 darbo dieną"', business)

    def test_robots_and_sitemap_are_publishable(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        server = (ROOT / "serve.py").read_text(encoding="utf-8")
        self.assertIn("User-agent: *", robots)
        self.assertIn("Sitemap:", robots)
        self.assertIn("<urlset", sitemap)
        self.assertIn('".txt"', server)
        self.assertIn('".xml"', server)

    def test_local_business_schema_uses_real_config_only(self):
        self.assertIn('"LocalBusiness"', self.seo)
        self.assertIn('"PostalAddress"', self.seo)
        self.assertIn("hasLocalBusinessData", self.seo)
        self.assertNotIn('streetAddress: "', self.seo)

    def test_analytics_requires_consent_and_has_consent_mode_v2(self):
        for consent_field in ("ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"):
            self.assertIn(consent_field, self.analytics)
        self.assertIn('analytics_storage: "denied"', self.analytics)
        self.assertIn('if (choice === "granted")', self.analytics)
        self.assertIn('https://www.googletagmanager.com/gtag/js?id=', self.analytics)
        self.assertIn('allow_google_signals: false', self.analytics)
        self.assertIn('allow_ad_personalization_signals: false', self.analytics)
        self.assertIn("clearAnalyticsCookies", self.analytics)

    def test_csp_allows_only_required_google_analytics_origins(self):
        for page in ROOT.glob("*.html"):
            html = page.read_text(encoding="utf-8")
            with self.subTest(page=page.name):
                self.assertIn("script-src-elem 'self' https://www.googletagmanager.com", html)
                self.assertIn("https://www.google-analytics.com", html)
                self.assertNotRegex(html, re.compile(r"script-src[^;]*unsafe-inline", re.I))


if __name__ == "__main__":
    unittest.main()
