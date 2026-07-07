import functools
import json
import os
import re
import sys
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from serve import NoCacheHandler, ThreadingHTTPServer  # noqa: E402


class QuietHandler(NoCacheHandler):
    def log_message(self, _format, *args):
        pass


class AtminimasSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = "http://127.0.0.1:{0}".format(cls.server.server_port)

        config = (ROOT / "assets" / "supabase-config.js").read_text(encoding="utf-8")
        cls.supabase_url = re.search(r'SUPABASE_URL:\s*"([^"]+)"', config).group(1)
        cls.supabase_key = re.search(r'SUPABASE_ANON_KEY:\s*"([^"]+)"', config).group(1)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def local_request(self, path):
        return urllib.request.urlopen(self.base_url + path, timeout=8)

    def supabase_request(self, path):
        request = urllib.request.Request(
            self.supabase_url + path,
            headers={
                "apikey": self.supabase_key,
                "Authorization": "Bearer " + self.supabase_key,
                "Accept": "application/json",
            },
        )
        return urllib.request.urlopen(request, timeout=15)

    def test_all_html_pages_load(self):
        pages = sorted(ROOT.glob("*.html"))
        self.assertGreaterEqual(len(pages), 16)
        for page in pages:
            with self.subTest(page=page.name):
                with self.local_request("/" + page.name) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn("text/html", response.headers.get("Content-Type", ""))
                    response.read()

    def test_local_references_exist(self):
        pattern = re.compile(r'(?:href|src)\s*=\s*["\']([^"\'#?]+)', re.I)
        for page in ROOT.glob("*.html"):
            html = page.read_text(encoding="utf-8")
            for reference in pattern.findall(html):
                if re.match(r"^(?:https?:|mailto:|tel:|data:|javascript:|//)", reference):
                    continue
                target = ROOT / reference.lstrip("/").replace("/", os.sep)
                with self.subTest(page=page.name, reference=reference):
                    self.assertTrue(target.exists(), "Nerastas vietinis failas: {0}".format(target))

    def test_pages_have_basic_metadata(self):
        for page in ROOT.glob("*.html"):
            html = page.read_text(encoding="utf-8")
            with self.subTest(page=page.name):
                self.assertRegex(html, r'<html[^>]+lang=["\']lt["\']')
                self.assertRegex(html, r"<title>[^<]+</title>")
                self.assertRegex(html, r"<h1(?:\s|>)")

    def test_private_project_files_are_not_served(self):
        for path in (
            "/gemini-code-1779135220512.env",
            "/supabase/schema.sql",
            "/app.py",
            "/serve.py",
            "/.gitignore",
        ):
            with self.subTest(path=path):
                with self.assertRaises(urllib.error.HTTPError) as error:
                    self.local_request(path)
                self.assertEqual(error.exception.code, 404)

    def test_security_headers_are_present(self):
        required = (
            "Content-Security-Policy",
            "Strict-Transport-Security",
            "X-Content-Type-Options",
            "Referrer-Policy",
            "Permissions-Policy",
            "X-Frame-Options",
        )
        with self.local_request("/index.html") as response:
            for header in required:
                with self.subTest(header=header):
                    self.assertTrue(response.headers.get(header))

    def test_no_known_mojibake_sequences(self):
        bad = re.compile(r"ā–|ā€|Ć—")
        files = list(ROOT.glob("*.html")) + list((ROOT / "assets").glob("*.js"))
        for path in files:
            with self.subTest(path=path.name):
                self.assertNotRegex(path.read_text(encoding="utf-8"), bad)

    def test_no_third_party_qr_service(self):
        files = list(ROOT.glob("*.html")) + list((ROOT / "assets").glob("*.js"))
        for path in files:
            with self.subTest(path=path.name):
                self.assertNotIn("api.qrserver.com", path.read_text(encoding="utf-8"))

    def test_legal_and_delivery_pages_exist(self):
        for name in (
            "rekvizitai.html",
            "taisykles.html",
            "grazinimas.html",
            "pranesti.html",
            "prieinamumas.html",
            "apmokejimas.html",
        ):
            with self.subTest(page=name):
                self.assertTrue((ROOT / name).is_file())

    def test_supabase_auth_and_public_profiles_are_reachable(self):
        with self.supabase_request("/auth/v1/settings") as response:
            self.assertEqual(response.status, 200)
            self.assertIsInstance(json.loads(response.read().decode("utf-8")), dict)

        with self.supabase_request("/rest/v1/profiliai?select=id&aktyvus=eq.true&limit=1") as response:
            self.assertIn(response.status, (200, 206))
            self.assertIsInstance(json.loads(response.read().decode("utf-8")), list)

    def test_private_rows_are_not_visible_anonymously(self):
        with self.supabase_request(
            "/rest/v1/profiliai?select=id&aktyvus=eq.false&limit=1"
        ) as response:
            self.assertEqual(json.loads(response.read().decode("utf-8")), [])

        with self.assertRaises(urllib.error.HTTPError) as error:
            self.supabase_request("/rest/v1/uzsakymai?select=id&limit=1")
        self.assertIn(error.exception.code, (401, 403))

        for table in ("atsisakymai", "turinio_pranesimai", "paslaugu_uzklausos"):
            with self.subTest(table=table):
                with self.assertRaises(urllib.error.HTTPError) as private_error:
                    self.supabase_request("/rest/v1/{0}?select=id&limit=1".format(table))
                self.assertIn(private_error.exception.code, (401, 403))

    def test_internal_qr_function_returns_svg(self):
        value = urllib.parse.quote(
            "https://example.com/sablonas-viskas.html?slug=qa-test",
            safe="",
        )
        with urllib.request.urlopen(
            self.supabase_url + "/functions/v1/qr-code?data=" + value,
            timeout=20,
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("image/svg+xml", response.headers.get("Content-Type", ""))
            self.assertIn(b"<svg", response.read(500))

    def test_parcel_locker_function_returns_lithuanian_locations(self):
        with urllib.request.urlopen(
            self.supabase_url + "/functions/v1/parcel-lockers?carrier=omniva",
            timeout=25,
        ) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertEqual(data.get("carrier"), "omniva")
            self.assertGreater(len(data.get("lockers", [])), 10)
            self.assertNotIn("recipient_email", data)

    def test_checkout_shortens_parcel_locker_instructions(self):
        checkout = (ROOT / "assets" / "checkout.js").read_text(encoding="utf-8")
        self.assertIn("function lockerOptionText(locker)", checkout)
        self.assertIn("/^(paštomatas|pakomāts)\\b/i", checkout)
        self.assertIn('return address + (postCode ? ", LT-" + postCode : "")', checkout)
        self.assertNotIn("terminalSelect.appendChild(option(value, value))", checkout)

    def test_homepage_has_qr_and_multi_service_flows(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="#qr-paslauga">Pirkti QR kodą</a>', html)
        self.assertIn('href="#kitos-paslaugos">Kitos paslaugos</a>', html)
        self.assertEqual(html.count('name="services"'), 3)
        for service in ("zvakes", "geles", "kapu_tvarkymas"):
            self.assertIn('value="{0}"'.format(service), html)
        for field in ("deceased_name", "cemetery_name", "grave_location"):
            self.assertRegex(html, r'name="{0}"[^>]*required'.format(field))
        self.assertGreaterEqual(html.count('service-choice__price'), 3)

    def test_service_variants_have_separate_price_slots(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        prices = (ROOT / "assets" / "service-prices.js").read_text(encoding="utf-8")
        home = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        for value in ("candle_1", "candle_2", "candle_5", "flower_1", "flower_bouquet"):
            self.assertIn('value="{0}"'.format(value), html)
            self.assertIn("{0}: null".format(value), prices)
        for value in ("cleaning_full", "cleaning_grooves", "cleaning_surface", "cleaning_monument", "cleaning_leaves"):
            self.assertIn('name="cleaning_tasks" value="{0}"'.format(value), html)
            self.assertIn("{0}: null".format(value), prices)
        self.assertIn('id="service-estimate-price"', html)
        self.assertIn('selectedNamedValues("cleaning_tasks")', home)
        self.assertIn("Preliminari kaina:", home)
        self.assertIn("data-cleaning-full", html)

    def test_service_request_flow_requires_auth_and_preserves_draft(self):
        home = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        self.assertIn("AtminimasAuth.accessToken()", home)
        self.assertIn("sessionStorage.setItem(draftKey", home)
        self.assertIn('restUrl("paslaugu_uzklausos")', home)
        login = (ROOT / "assets" / "login.js").read_text(encoding="utf-8")
        self.assertIn("function nextPage()", login)
        self.assertRegex(login, r"\^\[a-z0-9-\]\+\\\.html")

    def test_service_request_migration_has_rls_and_minimal_grants(self):
        sql = (ROOT / "supabase" / "migrations" / "20260707_service_requests.sql").read_text(encoding="utf-8")
        self.assertIn("alter table public.paslaugu_uzklausos enable row level security", sql.lower())
        self.assertIn("revoke all on table public.paslaugu_uzklausos from public, anon, authenticated", sql.lower())
        self.assertIn("grant select, insert, update on table public.paslaugu_uzklausos to authenticated", sql.lower())
        self.assertIn("owner_id = (select auth.uid())", sql)
        self.assertNotRegex(sql.lower(), r"grant\s+[^;]*\bto\s+anon\b")

    def test_shop_offers_metal_and_asa_products(self):
        html = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        self.assertIn('value="metal"', html)
        self.assertIn('value="asa"', html)
        self.assertIn('src="assets/qr-asa.png"', html)
        self.assertIn("ASA 3D ženkliukas", html)
        self.assertTrue((ROOT / "assets" / "qr-asa.png").stat().st_size > 100_000)

    def test_selected_product_reaches_order_and_admin(self):
        shop = (ROOT / "assets" / "shop.js").read_text(encoding="utf-8")
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        admin = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        self.assertIn("atminimas.selected-product.v1", shop)
        self.assertIn("redaktorius.html?product=", user)
        self.assertIn("data.product_type = productType", editor)
        self.assertIn("product_type: input && input.product_type", api)
        self.assertIn("product_type", admin)

        sql = (ROOT / "supabase" / "migrations" / "20260707_order_product_type.sql").read_text(encoding="utf-8")
        self.assertIn("product_type text not null default 'metal'", sql.lower())
        self.assertIn("check (product_type in ('metal', 'asa'))", sql.lower())

    def test_public_memorial_has_home_link_and_frame(self):
        html = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        self.assertIn('class="memorial-site-link" href="index.html"', html)
        self.assertIn("Atminimas – atidaryti pagrindinę svetainę", html)
        self.assertIn("width: 98%;", css)
        self.assertIn("border-top: 1px solid", css)
        self.assertIn("border-right: 1px solid", css)
        self.assertIn("border-left: 1px solid", css)
        self.assertNotIn("border-bottom: 1px solid rgba(61, 83, 72, 0.38)", css)

    def test_public_navigation_does_not_expose_admin_link(self):
        for page in ROOT.glob("*.html"):
            if page.name == "admin.html":
                continue
            html = page.read_text(encoding="utf-8")
            self.assertNotIn('href="admin.html"', html, page.name)

    def test_customer_pages_hide_internal_implementation_terms(self):
        clients = (ROOT / "klientai.html").read_text(encoding="utf-8")
        editor = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        for text in ("Kaip veikia DB", "Supabase lentelės", "slug arba ID"):
            self.assertNotIn(text, clients)
        for text in ("DB builderis", "saugomi į DB", "slug bus"):
            self.assertNotIn(text, editor)
        self.assertIn('<a href="klientai.html">Atidaryti puslapį</a>', editor)


if __name__ == "__main__":
    unittest.main(verbosity=2)
