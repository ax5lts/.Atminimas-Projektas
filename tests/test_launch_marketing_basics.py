import json
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

    def test_home_has_five_faqs_and_response_promise(self):
        self.assertEqual(self.home.count('class="faq-item"'), 5)
        self.assertIn('id="faq-title"', self.home)
        self.assertIn('data-business="responseTime"', self.home)
        business = (ROOT / "assets" / "business-config.js").read_text(encoding="utf-8")
        self.assertIn('responseTime: "per 1 darbo dieną"', business)

    def test_robots_and_sitemap_are_publishable(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        server = (ROOT / "serve.py").read_text(encoding="utf-8")
        self.assertIn("User-agent: *", robots)
        self.assertIn("Sitemap: https://atminimokodas.lt/sitemap.xml", robots)
        self.assertNotIn("github.io", robots)
        self.assertIn("<urlset", sitemap)
        self.assertIn(
            'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
            sitemap,
        )
        self.assertIn(
            "<image:loc>https://atminimokodas.lt/assets/qr-plienas.webp</image:loc>",
            sitemap,
        )
        self.assertRegex(sitemap, r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>")
        self.assertNotIn(
            "<image:loc>https://atminimokodas.lt/assets/qr-plienas-480.webp</image:loc>",
            sitemap,
        )
        self.assertIn('".txt"', server)
        self.assertIn('".xml"', server)
        for private_page in (
            "admin.html",
            "apmokejimas.html",
            "redaktorius.html",
            "slaptazodis.html",
            "vartotojas.html",
        ):
            self.assertNotIn("Disallow: /{0}".format(private_page), robots)

    def test_production_redirects_duplicate_homepage_to_canonical_url(self):
        config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        self.assertIn(
            {"source": "/index.html", "destination": "/", "permanent": True},
            config.get("redirects", []),
        )

    def test_homepage_uses_clear_search_titles(self):
        title = "Atminimo kodas – QR lentelė ir atminimo puslapis | Atminimas"
        description = (
            "Atminimo kodas – QR lentelė, kuri telefone atveria artimojo atminimo puslapį "
            "su gyvenimo istorija ir nuotraukomis. Sukurkite ir išsaugokite prisiminimus."
        )
        self.assertIn("<title>{0}</title>".format(title), self.home)
        self.assertIn('property="og:title" content="{0}"'.format(title), self.home)
        self.assertIn('name="twitter:title" content="{0}"'.format(title), self.home)
        self.assertIn('name="description" content="{0}"'.format(description), self.home)
        self.assertIn(
            '<h1 class="landing-title" id="landing-title">'
            "Atminimo kodas – QR lentelė artimojo istorijai išsaugoti</h1>",
            self.home,
        )
        self.assertIn("Atminimo kodas – tai ant kapavietės", self.home)
        self.assertIn('"@type": "WebSite"', self.seo)
        self.assertGreaterEqual(self.seo.count('alternateName: "Atminimo kodas"'), 2)

    def test_homepage_schema_is_static_valid_and_matches_business_config(self):
        schema_match = re.search(
            r'<script type="application/ld\+json" data-site-module="site-seo">\s*([\s\S]*?)\s*</script>',
            self.home,
        )
        self.assertIsNotNone(schema_match)
        schema = json.loads(schema_match.group(1))
        graph = {item["@type"]: item for item in schema["@graph"]}
        self.assertEqual(graph["WebSite"]["url"], "https://atminimokodas.lt/")
        self.assertEqual(graph["WebPage"]["url"], "https://atminimokodas.lt/")
        self.assertEqual(graph["LocalBusiness"]["url"], "https://atminimokodas.lt/")
        primary_image = graph["ImageObject"]
        self.assertEqual(
            graph["WebPage"]["primaryImageOfPage"]["@id"],
            primary_image["@id"],
        )
        self.assertEqual(
            graph["LocalBusiness"]["image"]["@id"],
            primary_image["@id"],
        )
        self.assertEqual(
            primary_image["contentUrl"],
            "https://atminimokodas.lt/assets/qr-plienas.webp",
        )
        self.assertEqual((primary_image["width"], primary_image["height"]), (1086, 1448))

        business_source = (ROOT / "assets" / "business-config.js").read_text(encoding="utf-8")
        business = {
            key: re.search(r'\b{0}:\s*"([^"]*)"'.format(key), business_source).group(1)
            for key in ("legalName", "address", "email", "phone")
        }
        local_business = graph["LocalBusiness"]
        self.assertEqual(local_business["legalName"], business["legalName"])
        self.assertEqual(local_business["email"], business["email"])
        self.assertEqual(local_business["telephone"], business["phone"])
        schema_address = local_business["address"]
        self.assertEqual(
            business["address"],
            "{0}, {1}, Lietuva".format(
                schema_address["streetAddress"],
                schema_address["addressLocality"],
            ),
        )
        self.assertNotIn('src="assets/business-config.js', self.home)
        self.assertNotIn('src="assets/site-seo.js', self.home)

    def test_homepage_primary_image_is_eager_and_descriptive(self):
        self.assertIn(
            '<source media="(max-width: 560px)" type="image/webp" '
            'srcset="assets/qr-plienas-480.webp">',
            self.home,
        )
        self.assertIn(
            'alt="Graviruota plieno QR atminimo lentelė artimojo atminimo puslapiui"',
            self.home,
        )
        self.assertIn('loading="eager" decoding="async" fetchpriority="high"', self.home)

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
