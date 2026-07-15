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

    def test_legacy_runtime_assets_are_removed(self):
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        memorial = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        security = (ROOT / "serve.py").read_text(encoding="utf-8")
        self.assertNotIn('"sablonas-viskas"', api)
        self.assertNotIn('"atminimai"', api)
        self.assertNotIn('"nuotraukos"', api)
        self.assertNotIn("Cloudinary", memorial + security)
        for path in (
            ROOT / "assets" / "grave-search.js",
            ROOT / "assets" / "cloudinary.js",
            ROOT / "assets" / "qr-asa.png",
            ROOT / "assets" / "qr-atminimo-lentele.png",
        ):
            with self.subTest(path=path.name):
                self.assertFalse(path.exists())

    def test_supabase_sources_match_the_deployed_structure(self):
        migration_names = [path.name for path in (ROOT / "supabase" / "migrations").glob("*.sql")]
        self.assertTrue(migration_names)
        for name in migration_names:
            with self.subTest(migration=name):
                version = name.split("_", 1)[0]
                self.assertTrue(version.isdigit())
                self.assertEqual(len(version), 14)
        self.assertIn("20260611152136_connect_profiliai_public_form.sql", migration_names)
        self.assertIn("20260713204058_restore_asa_3d_product.sql", migration_names)

        qr = (ROOT / "supabase" / "functions" / "qr-code" / "index.ts").read_text(encoding="utf-8")
        lockers = (ROOT / "supabase" / "functions" / "parcel-lockers" / "index.ts").read_text(encoding="utf-8")
        self.assertIn('npm:qrcode@1.5.4', qr)
        self.assertIn('target.pathname.endsWith("/sablonas-viskas.html")', qr)
        self.assertIn('"lp-express"', lockers)
        self.assertIn("slice(0, 1500)", lockers)

    def test_accessibility_structure_and_password_policy(self):
        memorial = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        editor = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        password = (ROOT / "slaptazodis.html").read_text(encoding="utf-8")
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        self.assertIn('class="memorial-dates"', memorial)
        self.assertIn('class="memorial-epitaph"', memorial)
        self.assertNotRegex(memorial, r'<h[2-6][^>]+id="atminimo-(?:datos|epitafija)"')
        self.assertIn('class="editor-photo-description__title"', editor)
        self.assertNotIn('<article class="editor-photo-description"><h3>', editor)
        self.assertEqual(password.count('minlength="12"'), 2)
        self.assertIn("minimum_password_length = 12", config)
        self.assertIn("secure_password_change = true", config)

    def test_pages_have_basic_metadata(self):
        for page in ROOT.glob("*.html"):
            html = page.read_text(encoding="utf-8")
            with self.subTest(page=page.name):
                self.assertRegex(html, r'<html[^>]+lang=["\']lt["\']')
                self.assertRegex(html, r"<title>[^<]+</title>")
                self.assertRegex(html, r'<meta\s+name=["\']description["\']\s+content=["\'][^"\']+["\']')
                self.assertRegex(html, r"<h1(?:\s|>)")

    def test_private_pages_are_not_indexed(self):
        for name in (
            "admin.html", "apmokejimas.html", "redaktorius.html",
            "slaptazodis.html", "vartotojas.html",
        ):
            html = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn('<meta name="robots" content="noindex,nofollow">', html)

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

    def test_server_has_opt_in_lan_preview(self):
        server_source = (ROOT / "serve.py").read_text(encoding="utf-8")
        self.assertIn('parser.add_argument("--lan"', server_source)
        self.assertIn('"0.0.0.0" if args.lan', server_source)

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

        for table in (
            "atsisakymai", "turinio_pranesimai", "paslaugu_uzklausos",
            "payment_events", "invoice_documents", "production_jobs",
            "automation_events", "automation_audit_log",
        ):
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
        self.assertIn("AtminimasAuth.isAdmin()", login)
        self.assertIn('"admin.html" : next', login)

    def test_service_request_migration_has_rls_and_minimal_grants(self):
        sql = (ROOT / "supabase" / "migrations" / "20260707120449_create_service_requests.sql").read_text(encoding="utf-8")
        self.assertIn("alter table public.paslaugu_uzklausos enable row level security", sql.lower())
        self.assertIn("revoke all on table public.paslaugu_uzklausos from public, anon, authenticated", sql.lower())
        self.assertIn("grant select, insert, update on table public.paslaugu_uzklausos to authenticated", sql.lower())
        self.assertIn("owner_id = (select auth.uid())", sql)
        self.assertNotRegex(sql.lower(), r"grant\s+[^;]*\bto\s+anon\b")

    def test_shop_offers_metal_and_asa_3d_plaques(self):
        html = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        self.assertIn('value="metal"', html)
        self.assertIn('value="asa"', html)
        self.assertIn('src="assets/qr-atminimo-lentele-480.webp"', html)
        self.assertIn('src="assets/qr-asa-480.webp"', html)
        self.assertIn("Graviruota QR atminimo lentelė", html)
        self.assertIn("ASA 3D spausdinta QR atminimo lentelė", html)
        self.assertLess((ROOT / "assets" / "qr-atminimo-lentele-480.webp").stat().st_size, 30_000)
        self.assertLess((ROOT / "assets" / "qr-atminimo-lentele.webp").stat().st_size, 100_000)
        self.assertLess((ROOT / "assets" / "qr-asa-480.webp").stat().st_size, 30_000)
        self.assertLess((ROOT / "assets" / "qr-asa.webp").stat().st_size, 100_000)

    def test_public_product_copy_has_no_sticker_variant(self):
        public_files = list(ROOT.glob("*.html")) + list((ROOT / "assets").glob("*.js"))
        forbidden = re.compile(r"lipduk|sticker|ženkliuk", re.I)
        for path in public_files:
            with self.subTest(path=path.name):
                self.assertNotRegex(path.read_text(encoding="utf-8"), forbidden)

    def test_order_buttons_open_the_metal_plaque_form(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        self.assertIn('<a class="button" href="redaktorius.html?product=metal">Užsakyti</a>', home)
        self.assertIn('id="product-create-link" href="redaktorius.html?product=metal">Užsakyti</a>', shop)

    def test_shop_explains_qr_flow_and_links_video(self):
        html = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        self.assertIn('id="kaip-veikia"', html)
        self.assertIn("https://www.youtube.com/shorts/2WZqJ18XkEI", html)
        self.assertIn("QR kodas ant paminklo", html)
        self.assertIn("Nuskenuojama telefonu", html)
        self.assertIn("Atsiveria atminimo puslapis", html)
        self.assertEqual(html.count('class="how-step"'), 3)

    def test_selected_product_reaches_order_and_admin(self):
        shop = (ROOT / "assets" / "shop.js").read_text(encoding="utf-8")
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        admin = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        self.assertIn("atminimas.selected-product.v1", shop)
        self.assertIn("redaktorius.html?product=", user)
        self.assertIn("data.product_type = productType", editor)
        self.assertIn('input.product_type === "asa" ? "asa" : "metal"', api)
        self.assertIn("product_type", admin)

        sql = (ROOT / "supabase" / "migrations" / "20260713204058_restore_asa_3d_product.sql").read_text(encoding="utf-8")
        self.assertIn("check (product_type in ('metal', 'asa'))", sql.lower())
        self.assertIn("asa 3d spausdinta qr atminimo lentelė", sql.lower())

    def test_admin_has_separate_all_orders_dashboard(self):
        html = (ROOT / "admin.html").read_text(encoding="utf-8")
        admin = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        order_security = (ROOT / "supabase" / "migrations" / "20260706081809_harden_orders_and_uploads.sql").read_text(encoding="utf-8")
        self.assertIn('id="admin-overview"', html)
        self.assertIn('id="admin-orders"', html)
        self.assertIn('id="order-rows"', html)
        self.assertIn("Visi užsakymai", html)
        self.assertIn("await AtminimasAuth.isAdmin()", admin)
        self.assertIn('"uzsakymai",', admin)
        self.assertIn("payment_reference", admin)
        self.assertIn("delivery_method", admin)
        self.assertIn("orderCache.length", admin)
        self.assertRegex(order_security, r"(?s)uzsakymai for select.*?r\.role = 'admin'")
        self.assertNotIn('href="vartotojas.html">Klientas</a>', html)

    def test_editor_supports_long_story_and_described_photo_gallery(self):
        html = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        public_page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        self.assertIn("MAX_PHOTOS = 8", editor)
        self.assertIn("MAX_STORY_WORDS = 1000", editor)
        self.assertIn('name="photo_caption_8"', html)
        self.assertIn('name="photo_alt_8"', html)
        self.assertIn(".slice(0, 8)", api)
        self.assertIn('item.caption = (input["photo_caption_" + imageIndex]', api)
        self.assertIn("buildStorySection", public_page)
        self.assertIn("buildStoryGallery", public_page)
        self.assertIn("builder-photo-caption", public_page)

    def test_dove_brand_and_favicon_are_used_everywhere(self):
        icon = ROOT / "assets" / "atminimas-dove.svg"
        svg = icon.read_text(encoding="utf-8")
        self.assertIn("Balandis su alyvmedžio šakele", svg)
        self.assertIn("#174f4a", svg)
        for page in ROOT.glob("*.html"):
            html = page.read_text(encoding="utf-8")
            self.assertIn('rel="icon" href="assets/atminimas-dove.svg"', html, page.name)
            self.assertNotIn('<span class="brand__mark">A</span>', html, page.name)

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

    def test_grave_search_pages_and_admin_flow_exist(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        search = (ROOT / "kapu-ieskojimas.html").read_text(encoding="utf-8")
        admin = (ROOT / "admin.html").read_text(encoding="utf-8")
        search_js = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        admin_js = (ROOT / "assets" / "graves-admin.js").read_text(encoding="utf-8")
        main_admin_js = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        self.assertIn('data-grave-search-form data-limit="3"', home)
        self.assertIn('data-grave-search-form', search)
        self.assertIn('<details class="grave-search-advanced">', search)
        self.assertIn('Tikslesnė paieška', search)
        self.assertNotIn('name="firstName"', search)
        self.assertNotIn('name="lastName"', search)
        self.assertIn('https://data.gov.lt/datasets/2779/?resource_version=1619', home)
        self.assertIn('https://data.gov.lt/datasets/2779/', search)
        self.assertIn('id="grave-admin-form"', admin)
        self.assertIn('/rest/v1/rpc/', search_js)
        self.assertIn('rpc("ieskoti_kapavieciu"', search_js)
        self.assertIn('/storage/v1/object/kapavietes/', admin_js)
        self.assertIn('window.dispatchEvent(new CustomEvent("atminimas:admin-ready"))', main_admin_js)
        self.assertIn('if (row.statusas === "atsaukta") return false;', main_admin_js)
        self.assertIn('Prefer: "return=representation"', main_admin_js)
        self.assertIn('Įrašas atšauktas ir paslėptas.', main_admin_js)

    def test_grave_migration_has_publication_rls_and_admin_writes(self):
        sql = (ROOT / "supabase" / "migrations" / "20260712194906_grave_search.sql").read_text(encoding="utf-8").lower()
        self.assertIn("alter table public.kapavietes enable row level security", sql)
        self.assertIn("statusas = 'paskelbtas'", sql)
        self.assertIn("to anon, authenticated", sql)
        self.assertIn("r.role = 'admin'", sql)
        self.assertIn("security invoker", sql)
        self.assertNotIn("security definer", sql)
        advisor_sql = (ROOT / "supabase" / "migrations" / "20260712194950_grave_search_advisor_fixes.sql").read_text(encoding="utf-8").lower()
        self.assertIn("kapavietes_created_by_idx", advisor_sql)
        self.assertIn("statusas = 'paskelbtas'", advisor_sql)

    def test_customer_pages_hide_internal_implementation_terms(self):
        clients = (ROOT / "klientai.html").read_text(encoding="utf-8")
        editor = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        for text in ("Kaip veikia DB", "Supabase lentelės", "slug arba ID"):
            self.assertNotIn(text, clients)
        for text in ("DB builderis", "saugomi į DB", "slug bus"):
            self.assertNotIn(text, editor)
        self.assertIn('<a href="klientai.html">Atidaryti puslapį</a>', editor)

    def test_automation_schema_uses_rls_and_private_documents(self):
        sql = (ROOT / "supabase" / "migrations" / "20260707164259_automation_foundation.sql").read_text(encoding="utf-8")
        for table in ("payment_events", "invoice_documents", "production_jobs", "automation_events", "automation_audit_log"):
            self.assertIn("alter table public.{0} enable row level security".format(table), sql.lower())
        self.assertIn("'automation-documents', 'automation-documents', false", sql)
        self.assertIn("grant execute on function public.create_invoice_record", sql)
        self.assertIn("to service_role", sql)
        self.assertNotRegex(sql.lower(), r"grant\s+(?:all|select|insert|update|delete)[^;]*public\.(?:payment_events|invoice_documents|production_jobs|automation_events|automation_audit_log)[^;]*\bto\s+anon\b")

    def test_payment_flow_is_server_verified(self):
        checkout = (ROOT / "assets" / "checkout.js").read_text(encoding="utf-8")
        payment = (ROOT / "supabase" / "functions" / "payment-create" / "index.ts").read_text(encoding="utf-8")
        webhook = (ROOT / "supabase" / "functions" / "payment-webhook" / "index.ts").read_text(encoding="utf-8")
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        self.assertIn('functionUrl("payment-create")', checkout)
        self.assertNotIn("STRIPE_SECRET_KEY", checkout)
        self.assertIn('.select("id,profilis_id,total_cents,currency', payment)
        self.assertIn('params.set("line_items[0][price_data][unit_amount]", String(order.total_cents))', payment)
        self.assertIn('request.headers.get("stripe-signature")', webhook)
        self.assertIn("crypto.subtle.sign", webhook)
        self.assertIn('client.rpc("process_stripe_payment_event"', webhook)
        transactional = (ROOT / "supabase" / "migrations" / "20260707164658_transactional_payment_webhook.sql").read_text(encoding="utf-8")
        self.assertIn("where id = p_order_id for update", transactional.lower())
        self.assertIn("p_amount_cents = ord.total_cents", transactional)
        self.assertIn("upper(p_currency) = ord.currency", transactional)
        self.assertRegex(config, r"(?s)\[functions\.payment-webhook\]\s*verify_jwt\s*=\s*false")

    def test_customer_approval_precedes_production(self):
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        sql = (ROOT / "supabase" / "migrations" / "20260707164259_automation_foundation.sql").read_text(encoding="utf-8")
        self.assertIn("approve_order_for_production", user)
        self.assertIn("Patvirtinti gamybai", user)
        self.assertRegex(sql, r"(?s)old\.customer_approved_at is null.*?insert into public\.production_jobs")
        self.assertIn("production.qr_requested", sql)

    def test_automation_worker_covers_required_notifications(self):
        worker = (ROOT / "supabase" / "functions" / "automation-worker" / "index.ts").read_text(encoding="utf-8")
        reminders = (ROOT / "supabase" / "functions" / "automation-reminders" / "index.ts").read_text(encoding="utf-8")
        for event in ("invoice.requested", "payment.confirmed", "production.approval_requested", "shipping.sent", "shipping.delivered", "service.scheduled", "service.completed"):
            self.assertIn(event, worker)
        self.assertIn("order.unpaid_reminder", reminders)
        self.assertIn("profile.unfinished_reminder", reminders)
        self.assertIn("service.reminder", reminders)
        self.assertNotIn('update({ reminder_sent_at: now.toISOString() })', reminders)

    def test_shipping_adapter_is_server_side_and_scheduled(self):
        shipping = (ROOT / "supabase" / "functions" / "_shared" / "shipping.ts").read_text(encoding="utf-8")
        cron = (ROOT / "supabase" / "cron-setup.sql.example").read_text(encoding="utf-8")
        self.assertIn('env("SHIPMENT_ADAPTER_SECRET"', shipping)
        self.assertIn('url.protocol !== "https:"', shipping)
        self.assertIn("label_storage_path", shipping)
        self.assertIn("vault.decrypted_secrets", cron)
        self.assertIn("atminimas-shipping-sync", cron)
        self.assertNotIn("PAKEISTI_AUTOMATION_SECRET", cron)

    def test_pdf_uses_pinned_static_unicode_font(self):
        pdf = (ROOT / "supabase" / "functions" / "_shared" / "invoice-pdf.ts").read_text(encoding="utf-8")
        self.assertIn("ffebf8c1ee449e544955a7e813c54f9b73848eac", pdf)
        self.assertIn("NotoSans-Regular.ttf", pdf)
        self.assertIn('"MOKĖJIMO PATVIRTINIMAS"', pdf)

    def test_mobile_pages_use_lightweight_images_and_loader(self):
        core_pages = (
            "index.html", "parduotuve.html", "vartotojas.html", "admin.html",
            "apmokejimas.html", "redaktorius.html", "sablonas-viskas.html",
            "klientai.html", "prisijungti.html", "registruotis.html",
        )
        for name in core_pages:
            html = (ROOT / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertRegex(html, r"<body[^>]*\bdata-loading\b")
                self.assertIn('src="assets/loading.js?v=20260707-1"', html)
        for image in ("qr-atminimo-lentele.webp", "qr-atminimo-lentele-480.webp", "qr-asa.webp", "qr-asa-480.webp"):
            with self.subTest(image=image):
                self.assertTrue((ROOT / "assets" / image).is_file())
                self.assertLess((ROOT / "assets" / image).stat().st_size, 100_000)
        served = (ROOT / "index.html").read_text(encoding="utf-8") + (ROOT / "parduotuve.html").read_text(encoding="utf-8") + (ROOT / "assets" / "shop.js").read_text(encoding="utf-8")
        self.assertNotIn("qr-atminimo-lentele.png", served)
        self.assertNotIn("qr-asa.png", served)

    def test_memorial_media_is_mobile_optimized(self):
        page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        self.assertIn('image.loading = "lazy"', page)
        self.assertIn('image.decoding = "async"', page)
        self.assertIn('player.preload = "none"', page)
        self.assertIn("1200 / Math.max(img.naturalWidth, img.naturalHeight)", editor)
        self.assertIn("1600 / Math.max(sourceW, sourceH)", editor)
        self.assertIn('"image/webp", 0.82', editor)

    def test_editor_is_responsive_and_has_touch_color_wheel(self):
        page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        self.assertIn('id="editor-color-wheel"', page)
        self.assertIn('id="editor-color-brightness"', page)
        self.assertIn('type="hidden" name="fono_spalva"', page)
        self.assertNotIn('type="color" name="fono_spalva"', page)
        self.assertIn('data-editor-section="preview"', page)
        self.assertIn("colorFromWheelPoint", editor)
        self.assertIn('colorWheel.addEventListener("pointerdown"', editor)
        self.assertIn('colorWheel.addEventListener("keydown"', editor)
        self.assertIn('target.scrollIntoView({ behavior: "smooth"', editor)
        self.assertIn("@media (min-width: 861px) and (max-width: 1280px)", styles)
        self.assertIn("@media (pointer: coarse)", styles)
        self.assertIn('"canvas"', styles)

    def test_owner_can_edit_and_safely_delete_memorial_page(self):
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        function = (ROOT / "supabase" / "functions" / "profile-manage" / "index.ts").read_text(encoding="utf-8")
        migration = (ROOT / "supabase" / "migrations" / "20260707180232_profile_edit_delete.sql").read_text(encoding="utf-8")

        self.assertIn("redaktorius.html?edit=", user)
        self.assertIn("button--danger", user)
        self.assertIn("data-delete-profile", user)
        self.assertIn("window.confirm", user)
        self.assertIn(".button--danger", styles)
        self.assertIn('get("edit")', editor)
        self.assertIn("loadProfileForEditing", editor)
        self.assertIn("AtminimasApi.updateAtminimas", editor)
        self.assertIn("updateAtminimas: updateAtminimas", api)
        self.assertIn("deleteAtminimas: deleteAtminimas", api)

        self.assertIn("profile.owner_id !== user.id", function)
        self.assertIn('.storage.from("atminimas").remove', function)
        self.assertIn('action === "delete"', function)
        self.assertIn("retained_order", function)
        self.assertIn("add column if not exists deleted_at", migration.lower())
        self.assertIn("aktyvus = true and deleted_at is null", migration.lower())
        self.assertIn("revoke delete on table public.profiliai from anon, authenticated", migration.lower())
        self.assertIn("owner_id = (select auth.uid())::text", migration)

    def test_password_recovery_uses_live_site_instead_of_localhost(self):
        page = (ROOT / "slaptazodis.html").read_text(encoding="utf-8")
        script = (ROOT / "assets" / "password-reset.js").read_text(encoding="utf-8")
        login = (ROOT / "prisijungti.html").read_text(encoding="utf-8")
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        self.assertIn("Pamiršau slaptažodį", login)
        self.assertIn('id="password-request-form"', page)
        self.assertIn('id="password-update-form"', page)
        self.assertIn('/recover?redirect_to=', script)
        self.assertIn('method: "PUT"', script)
        self.assertIn('Authorization: "Bearer " + accessToken', script)
        self.assertIn('site_url = "https://ax5lts.github.io/.Atminimas-Projektas/"', config)
        self.assertNotIn('site_url = "http://127.0.0.1:3000"', config)


if __name__ == "__main__":
    unittest.main(verbosity=2)
