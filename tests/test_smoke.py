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
            ROOT / "assets" / "qr-plienas.png",
            ROOT / "assets" / "demo-jonas-portretas.jpg",
            ROOT / "assets" / "demo-jonas-seima.jpg",
            ROOT / "assets" / "demo-jonas-dirbtuves.jpg",
            ROOT / "assets" / "demo-jonas-sodas.jpg",
        ):
            with self.subTest(path=path.name):
                self.assertFalse(path.exists())

    def test_homepage_navigation_reflects_auth_session(self):
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        home_js = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        self.assertIn("data-auth-navigation", homepage)
        self.assertEqual(homepage.count("data-auth-guest"), 2)
        self.assertEqual(homepage.count("data-auth-user"), 2)
        self.assertIn('href="vartotojas.html" data-auth-user', homepage)
        self.assertIn("data-auth-signout", homepage)
        self.assertIn("AtminimasAuth.accessToken()", home_js)
        self.assertIn("AtminimasAuth.signOut()", home_js)
        self.assertIn('window.addEventListener("storage", renderAuthNavigation)', home_js)

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
        self.assertIn("20260719090808_add_steel_product.sql", migration_names)

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
        for field in ("deceased_name", "cemetery_name", "municipality", "grave_location", "contact_email"):
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
        self.assertIn('functionUrl("service-flow")', home)
        self.assertIn("estimated_total_min_cents", home)
        self.assertIn("data-cleaning-full", html)

    def test_service_request_flow_is_guest_first_and_claimed_before_payment(self):
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        home = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        service_flow = (ROOT / "supabase" / "functions" / "service-flow" / "index.ts").read_text(encoding="utf-8")
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        self.assertIn('name="contact_email"', page)
        self.assertIn("Užklausą pateiksite be paskyros", page)
        self.assertNotIn('if (!AtminimasAuth.accessToken())', home)
        self.assertIn('action: "create"', home)
        self.assertIn('functionUrl("service-flow")', home)
        self.assertIn("optionalUser(request)", service_flow)
        self.assertIn("owner_id: ownerId", service_flow)
        self.assertIn("session?.user.email_confirmed_at && sessionEmail === contactEmail", service_flow)
        self.assertIn('action === "claim"', service_flow)
        self.assertIn('serviceFlow("claim"', user)
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

    def test_service_quotes_use_server_estimate_admin_offer_customer_acceptance_and_separate_payment(self):
        home_page = (ROOT / "index.html").read_text(encoding="utf-8")
        home = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        admin_page = (ROOT / "admin.html").read_text(encoding="utf-8")
        admin = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        user_page = (ROOT / "vartotojas.html").read_text(encoding="utf-8")
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        grave_search = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        service_flow = (ROOT / "supabase" / "functions" / "service-flow" / "index.ts").read_text(encoding="utf-8")
        webhook = (ROOT / "supabase" / "functions" / "payment-webhook" / "index.ts").read_text(encoding="utf-8")
        migration = (ROOT / "supabase" / "migrations" / "20260719151000_service_quote_flow.sql").read_text(encoding="utf-8")
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")

        self.assertIn('name="municipality"', home_page)
        self.assertIn('name="destination_latitude"', home_page)
        self.assertIn('name="destination_longitude"', home_page)
        self.assertIn('id="service-estimate-travel"', home_page)
        self.assertIn("kelionės įvertį nuo Panevėžio", home_page)
        self.assertIn('graveMunicipality', grave_search)
        self.assertIn('graveCemetery', grave_search)

        self.assertIn('functionUrl("service-flow")', home)
        self.assertIn('action: "estimate"', home)
        self.assertIn('action: "create"', home)
        self.assertNotIn('restUrl("paslaugu_uzklausos")', home)
        self.assertIn("estimated_round_trip_min_km", home)
        self.assertIn("Vietos automatiškai įvertinti nepavyko", home)

        self.assertIn('id="service-pricing-form"', admin_page)
        self.assertIn('name="travel_rate_eur_per_km"', admin_page)
        self.assertIn('data-send-service-quote', admin)
        self.assertIn('serviceFlow("send_quote"', admin)
        self.assertIn('serviceFlow("save_settings"', admin)
        self.assertIn('id="user-services"', user_page)
        self.assertIn('data-service-accept', user)
        self.assertIn('data-service-decline', user)
        self.assertIn('data-service-payment', user)
        self.assertIn('assets/user.js?v=20260719-4', user_page)
        self.assertIn('data-service-retry', user)
        self.assertIn('scrollToRequestedService', user)
        self.assertIn('accept_my_service_quote', user)
        self.assertIn('action: "start_payment"', user)
        self.assertIn('Pakeisti ir siųsti iš naujo', admin)
        self.assertIn('Klientas jau priėmė šį pasiūlymą', admin)
        self.assertIn('Sąrašo automatiškai atnaujinti nepavyko', admin)

        lower_migration = migration.lower()
        self.assertIn("create table if not exists public.service_quote_settings", lower_migration)
        self.assertIn("alter table public.service_quote_settings enable row level security", lower_migration)
        self.assertIn("revoke all on table public.service_quote_settings from public, anon, authenticated", lower_migration)
        self.assertIn("revoke insert on table public.paslaugu_uzklausos from authenticated", lower_migration)
        self.assertIn("create or replace function public.admin_send_service_quote", lower_migration)
        self.assertIn("create or replace function public.accept_my_service_quote", lower_migration)
        self.assertIn("create or replace function public.decline_my_service_quote", lower_migration)
        self.assertIn("create table if not exists public.service_payment_events", lower_migration)
        self.assertIn("process_stripe_service_payment_event", lower_migration)
        self.assertIn("quote_revision is distinct from p_expected_revision", lower_migration)
        self.assertIn("p_amount_cents = req.quote_amount_cents", lower_migration)
        self.assertIn("create or replace function public.begin_my_service_payment", lower_migration)
        self.assertIn("create or replace function public.attach_service_payment_session", lower_migration)
        self.assertIn("payment_session_id", lower_migration)
        self.assertIn("payment_session_expires_at", lower_migration)
        self.assertIn("interval '35 minutes'", lower_migration)
        self.assertIn("interval '23 hours 55 minutes'", lower_migration)
        self.assertIn("create or replace function public.fail_unattached_service_payment", lower_migration)
        self.assertIn("create table if not exists private.service_request_rate_limits", lower_migration)
        self.assertIn("create or replace function public.consume_service_request_rate_limit", lower_migration)
        self.assertIn("subject_hash", lower_migration)
        self.assertNotIn("ip_address", lower_migration)
        self.assertIn("checkout.session.expired", lower_migration)
        self.assertIn("revoke update on table public.paslaugu_uzklausos from authenticated", lower_migration)

        self.assertIn("function haversineKm", service_flow)
        self.assertIn("roundUpFive", service_flow)
        self.assertIn("manual_review_over_one_way_km", service_flow)
        self.assertIn("requireAdmin(request)", service_flow)
        self.assertIn("admin_send_service_quote", service_flow)
        self.assertIn("metadata[service_request_id]", service_flow)
        self.assertIn("metadata[payment_attempt_id]", service_flow)
        self.assertIn("attach_service_payment_session", service_flow)
        self.assertIn("fail_unattached_service_payment", service_flow)
        self.assertIn("consume_service_request_rate_limit", service_flow)
        self.assertIn('name: "HMAC"', service_flow)
        self.assertIn("readStripeSession", service_flow)
        self.assertIn('params.set("expires_at", String(sessionExpirySeconds))', service_flow)
        self.assertNotIn("nowSeconds", service_flow)
        self.assertNotIn("quoteExpirySeconds", service_flow)
        self.assertNotIn("session?.client || adminClient()", service_flow)
        self.assertGreaterEqual(service_flow.count("const client = adminClient();"), 6)
        self.assertIn("service-checkout-${service.id}-${service.quote_revision}-${service.payment_attempt_id}", service_flow)
        self.assertNotIn("service.updated_at", service_flow)
        self.assertIn("Kapavietės priežiūros paslaugos", service_flow)
        self.assertIn("process_stripe_service_payment_event", webhook)
        self.assertIn("entity_type", webhook)
        self.assertIn("UUID_PATTERN.test(serviceRequestId)", webhook)
        self.assertIn("UUID_PATTERN.test(paymentAttemptId)", webhook)
        self.assertIn("[functions.service-flow]", config)
        self.assertIn("verify_jwt = false", config.split("[functions.service-flow]", 1)[1].split("[", 1)[0])

    def test_shop_offers_metal_steel_and_asa_3d_plaques(self):
        html = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        self.assertIn('value="metal"', html)
        self.assertIn('value="steel"', html)
        self.assertIn('value="asa"', html)
        self.assertIn('src="assets/qr-atminimo-lentele-480.webp"', html)
        self.assertIn('src="assets/qr-plienas-480.webp"', html)
        self.assertIn('src="assets/qr-asa-480.webp"', html)
        self.assertIn("Graviruota QR atminimo lentelė", html)
        self.assertIn("Graviruota plieno QR atminimo lentelė", html)
        self.assertIn("ASA 3D spausdinta QR atminimo lentelė", html)
        self.assertLess((ROOT / "assets" / "qr-atminimo-lentele-480.webp").stat().st_size, 30_000)
        self.assertLess((ROOT / "assets" / "qr-atminimo-lentele.webp").stat().st_size, 100_000)
        self.assertLess((ROOT / "assets" / "qr-plienas-480.webp").stat().st_size, 30_000)
        self.assertLess((ROOT / "assets" / "qr-plienas.webp").stat().st_size, 100_000)
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
        self.assertIn('id="product-create-link" href="redaktorius.html?product=metal">Rinktis ir kurti puslapį</a>', shop)

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
        self.assertIn("steel: {", shop)
        self.assertIn("redaktorius.html?product=", user)
        self.assertIn("steel: {", editor)
        self.assertIn("data.product_type = productType", editor)
        self.assertIn('["asa", "steel"].indexOf(input.product_type)', api)
        self.assertIn("steel_price", admin)
        self.assertIn("product_type", admin)

        sql = (ROOT / "supabase" / "migrations" / "20260719090808_add_steel_product.sql").read_text(encoding="utf-8")
        self.assertIn("check (id in ('metal', 'steel', 'asa'))", sql.lower())
        self.assertIn("check (product_type in ('metal', 'steel', 'asa'))", sql.lower())
        self.assertIn("graviruota plieno qr atminimo lentelė", sql.lower())

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

    def test_admin_can_delete_pages_and_orders_separately(self):
        html = (ROOT / "admin.html").read_text(encoding="utf-8")
        admin = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        manage = (ROOT / "supabase" / "functions" / "profile-manage" / "index.ts").read_text(encoding="utf-8")

        self.assertIn('assets/admin.js?v=20260719-4', html)
        self.assertIn("data-delete-admin-profile", admin)
        self.assertIn("data-delete-admin-order", admin)
        self.assertIn("orderCanBeDeleted", admin)
        self.assertIn("profileCanBeDeletedCompletely", admin)
        self.assertIn('action: "delete"', admin)
        self.assertIn('action: "delete_order"', admin)
        self.assertIn("Ištrinti puslapį", admin)
        self.assertIn("Ištrinti užsakymą", admin)
        self.assertIn("Atminimo puslapis paliktas.", admin)
        self.assertIn("Atminimo puslapis, užsakymas ir siuntimo įrašas ištrinti.", admin)
        self.assertIn("deleted_at=is.null", admin)

        self.assertIn("adminAccess", manage)
        self.assertIn('.eq("role", "admin")', manage)
        self.assertIn("if (!isOwner && !isAdmin)", manage)
        self.assertIn('action === "delete_order"', manage)
        self.assertIn("Apmokėto arba apskaitoje naudojamo užsakymo ištrinti negalima", manage)
        self.assertIn('.from("uzsakymai").delete().eq("id", orderId)', manage)
        self.assertIn('.from("invoice_documents")', manage)
        self.assertIn("deleted_orders", manage)
        self.assertIn("mustRetainOrder", manage)

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

    def test_candle_jpg_brand_and_favicon_are_used_everywhere(self):
        icon = ROOT / "assets" / "atminimas-candle.jpg"
        image = icon.read_bytes()
        self.assertTrue(image.startswith(b"\xff\xd8\xff"))
        self.assertGreater(len(image), 10_000)
        for page in ROOT.glob("*.html"):
            html = page.read_text(encoding="utf-8")
            self.assertIn('rel="icon" href="assets/atminimas-candle.jpg" type="image/jpeg"', html, page.name)
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

    def test_grave_photo_uploads_are_private_moderated_and_linked_to_official_graves(self):
        page = (ROOT / "kapu-ieskojimas.html").read_text(encoding="utf-8")
        search_js = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        admin_page = (ROOT / "admin.html").read_text(encoding="utf-8")
        admin_js = (ROOT / "assets" / "grave-photo-admin.js").read_text(encoding="utf-8")
        photo_edge = (ROOT / "supabase" / "functions" / "grave-photo" / "index.ts").read_text(encoding="utf-8")
        search_edge = (ROOT / "supabase" / "functions" / "cemetery-search" / "index.ts").read_text(encoding="utf-8")
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        privacy = (ROOT / "privatumas.html").read_text(encoding="utf-8")
        terms = (ROOT / "taisykles.html").read_text(encoding="utf-8")
        migration = (ROOT / "supabase" / "migrations" / "20260719100758_grave_photo_submissions.sql").read_text(encoding="utf-8")

        self.assertIn('id="grave-photo-dialog"', page)
        self.assertIn('name="rights"', page)
        self.assertIn('assets/auth.js', page)
        self.assertIn("canvas.toBlob", search_js)
        self.assertIn('"image/jpeg"', search_js)
        self.assertIn("grave_photo_submissions", search_js)
        self.assertIn("grave_source_id", search_edge)
        self.assertIn('id="grave-photo-review-rows"', admin_page)
        self.assertIn("data-preview-photo", admin_js)
        self.assertIn('setDecision(row, "approved"', admin_js)

        lower_sql = migration.lower()
        self.assertIn("alter table public.grave_photo_submissions enable row level security", lower_sql)
        self.assertIn("'grave-photo-submissions'", migration)
        self.assertIn("false,", migration)
        self.assertIn("status = 'pending'", lower_sql)
        self.assertIn("r.role = 'admin'", lower_sql)
        self.assertNotRegex(lower_sql, r"grant\s+[^;]+grave_photo_submissions\s+to\s+anon")
        self.assertIn('params.set("status", "eq.approved")', photo_edge)
        self.assertIn("await isAdmin(request)", photo_edge)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY", photo_edge)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", search_js)
        self.assertIn("[functions.grave-photo]", config)
        self.assertIn("EXIF", privacy)
        self.assertIn("Nuotraukų iš kitų svetainių", terms)

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
        for image in ("qr-atminimo-lentele.webp", "qr-atminimo-lentele-480.webp", "qr-plienas.webp", "qr-plienas-480.webp", "qr-asa.webp", "qr-asa-480.webp"):
            with self.subTest(image=image):
                self.assertTrue((ROOT / "assets" / image).is_file())
                self.assertLess((ROOT / "assets" / image).stat().st_size, 100_000)
        served = (ROOT / "index.html").read_text(encoding="utf-8") + (ROOT / "parduotuve.html").read_text(encoding="utf-8") + (ROOT / "assets" / "shop.js").read_text(encoding="utf-8")
        self.assertNotIn("qr-atminimo-lentele.png", served)
        self.assertNotIn("qr-plienas.png", served)
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

    def test_maironis_demo_is_available_in_editor_and_public_page(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        editor_page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor_script = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        memorial_page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        demo_script = (ROOT / "assets" / "demo-jonas.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")

        self.assertIn("maironis-pavyzdys", home)
        self.assertIn("maironis-pavyzdys", shop)
        self.assertIn('<a href="parduotuve.html">Parduotuvė</a>\n        <a href="sablonas-viskas.html?slug=maironis-pavyzdys">Pavyzdys</a>', home)
        self.assertIn("Peržiūrėti Maironio puslapio pavyzdį", shop)
        self.assertIn('src="assets/demo-jonas.js?v=20260719-2"', editor_page)
        self.assertIn('src="assets/demo-jonas.js?v=20260719-2"', memorial_page)
        self.assertIn('demoId === "maironis" || demoId === "jonas"', editor_script)
        self.assertIn("AtminimasDemo.isMaironisIdentifier", memorial_page)
        self.assertLess(memorial_page.index('document.getElementById("turinys").hidden = false'), memorial_page.index("if (builderTitle) fitBuilderName(builderTitle)"))
        self.assertIn("maironis, tikrasis vardas jonas mačiulis", demo_script.lower())
        self.assertIn('gimimo_data: "1862-11-02"', demo_script)
        self.assertIn('mirties_data: "1932-06-28"', demo_script)
        self.assertIn("Viešoji sritis (Public Domain)", demo_script)
        self.assertIn("Nuotraukų šaltiniai", memorial_page)
        self.assertIn("buildMediaSources(allImages)", memorial_page)
        self.assertIn('root.style.setProperty("--memorial-page-background", background)', memorial_page)
        self.assertIn("var stageBackground = applyMemorialBackground", memorial_page)
        self.assertGreaterEqual(styles.count("var(--memorial-page-background, #f2ede4)"), 3)
        self.assertNotIn("Jonas gimė 1948", demo_script)
        self.assertNotIn("assets/demo-jonas-portretas.jpg", demo_script)

        for image in (
            "maironis-portretas-1900.jpg",
            "maironis-portretas-1908.jpg",
            "maironis-darbo-kabinete-1912.jpg",
            "maironis-siluvoje-1912.jpg",
        ):
            with self.subTest(image=image):
                path = ROOT / "assets" / image
                self.assertTrue(path.is_file())
                self.assertLess(path.stat().st_size, 400_000)

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

        self.assertIn("const isOwner = profile.owner_id === user.id", function)
        self.assertIn("if (!isOwner && !isAdmin)", function)
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

    def test_shared_mobile_navigation_and_reduced_loader_are_enabled(self):
        site_ui = (ROOT / "assets" / "site-ui.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        loader = (ROOT / "assets" / "loading.js").read_text(encoding="utf-8")
        server = (ROOT / "serve.py").read_text(encoding="utf-8")
        for page in ROOT.glob("*.html"):
            with self.subTest(page=page.name):
                self.assertIn("assets/site-ui.js?v=20260716-1", page.read_text(encoding="utf-8"))
        self.assertIn("mobile-dock", site_ui)
        self.assertIn("data-site-menu-toggle", site_ui)
        self.assertIn("Pereiti prie turinio", site_ui)
        self.assertIn(".mobile-dock", styles)
        self.assertIn('document.addEventListener("DOMContentLoaded", hideLoader', loader)
        self.assertIn('"Permissions-Policy": "camera=(), microphone=(), geolocation=(self)"', server)
        self.assertIn("frame-src https://www.openstreetmap.org", server)

    def test_editor_has_five_mobile_steps_reorder_and_save_progress(self):
        page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        for step in ("text", "colors", "files", "positions", "preview"):
            self.assertIn('data-editor-step="{0}"'.format(step), page)
            self.assertIn('data-editor-step-button="{0}"'.format(step), page)
        self.assertIn('id="editor-photo-order"', page)
        self.assertIn('id="editor-save-progress"', page)
        self.assertIn("activateEditorStep", editor)
        self.assertIn("swapPhotoOrder", editor)
        self.assertIn("data-photo-move", editor)
        self.assertIn("onUploadProgress", editor)
        self.assertIn("typeof onProgress", api)
        self.assertIn(".editor-preview-open .editor-canvas", styles)
        self.assertIn("view-transition-name: selected-product-image", styles)

    def test_editor_uses_simple_separate_date_parts_on_mobile(self):
        page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        self.assertNotIn('type="date" name="gimimo_data"', page)
        self.assertNotIn('type="date" name="mirties_data"', page)
        self.assertIn('type="hidden" name="gimimo_data"', page)
        self.assertIn('type="hidden" name="mirties_data"', page)
        self.assertEqual(page.count("data-date-year"), 2)
        self.assertEqual(page.count("data-date-month"), 2)
        self.assertEqual(page.count("data-date-day"), 2)
        self.assertIn("daysInMonth", editor)
        self.assertIn("validateDatePickers", editor)
        self.assertIn("Mirties data negali būti ankstesnė už gimimo datą.", editor)
        self.assertIn("Data negali būti vėlesnė nei šiandien.", editor)
        self.assertIn(".editor-date-picker__fields", styles)
        self.assertIn(".editor-date-picker.has-error", styles)

    def test_editor_and_memorial_auto_fit_dynamic_stage_height(self):
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        editor_page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        memorial = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        demo = (ROOT / "assets" / "demo-jonas.js").read_text(encoding="utf-8")

        self.assertIn("var MIN_STAGE_HEIGHT_PCT = 160", editor)
        self.assertIn("function fitStageToContent(allowShrink, forcedPiece)", editor)
        self.assertIn("fitStageToContent(false, piece)", editor)
        self.assertIn("fitStageToContent(true)", editor)
        self.assertIn("topPct: String(layoutNumber(topPct))", editor)
        self.assertIn("heightPct: canMeasureStage", editor)
        self.assertIn("layoutVersion: 2", editor)
        self.assertIn("legacyTopToWidthPct", editor)
        self.assertNotIn('piece.style.top = top + "%"', editor)
        self.assertIn("Puslapio apačia prisitaiko automatiškai", editor_page)

        self.assertIn("legacyTopToWidthPct", memorial)
        self.assertIn("element.dataset.topPct", memorial)
        self.assertIn("bottom = Math.max(bottom, element.offsetTop + element.offsetHeight)", memorial)
        self.assertIn("Math.max(heightPct, Math.max(MIN_STAGE_HEIGHT_PCT", memorial)
        self.assertIn("view.style.height = Math.round(width * heightPct / 100) + \"px\"", memorial)

        # The bundled example intentionally remains on the old coordinate shape,
        # so rendering it exercises backwards-compatible conversion.
        self.assertIn('top: "91%"', demo)

    def test_guest_builds_locally_and_signs_in_only_before_payment(self):
        editor_page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        checkout_page = (ROOT / "apmokejimas.html").read_text(encoding="utf-8")
        checkout = (ROOT / "assets" / "checkout.js").read_text(encoding="utf-8")
        login_page = (ROOT / "prisijungti.html").read_text(encoding="utf-8")
        login = (ROOT / "assets" / "login.js").read_text(encoding="utf-8")
        migration = (ROOT / "supabase" / "migrations" / "20260719130126_guest_editor_auth_boundary.sql").read_text(encoding="utf-8")
        update_grants = (ROOT / "supabase" / "migrations" / "20260719130334_restore_profile_update_columns.sql").read_text(encoding="utf-8")

        self.assertIn("Kurti galite neprisijungę", editor_page)
        self.assertIn("prisijungti reikės tik tęsiant užsakymą prieš apmokėjimą", editor_page)
        self.assertIn('if (!isDemoMode && editId && !isSignedIn())', editor)
        self.assertNotIn('if (!isDemoMode && window.AtminimasAuth && !AtminimasAuth.accessToken())', editor)
        self.assertIn("async function persistDraftBeforeLogin()", editor)
        self.assertIn("redirectToLoginForOrder", editor)
        self.assertIn('editorParams.get("resume") === "order"', editor)
        self.assertIn('await putDraftFile("captions", captions)', editor)
        self.assertIn('await getDraftFile("captions")', editor)
        self.assertIn('store.delete(draftFileKey("captions"))', editor)
        self.assertGreaterEqual(editor.count("await discardCurrentDraft();"), 2)
        self.assertIn('var clientUrl = "vartotojas.html"', editor)

        self.assertIn("function checkoutReturnUrl()", checkout)
        self.assertIn('"prisijungti.html?next=" + encodeURIComponent(checkoutReturnUrl())', checkout)
        self.assertIn("var me = await AtminimasAuth.user()", checkout)
        self.assertIn("hasExplicitNext", login)
        self.assertIn('!hasExplicitNext && await AtminimasAuth.isAdmin() ? "admin.html" : next', login)
        self.assertIn("Kurti galite ir neprisijungę", login_page)
        self.assertIn("assets/checkout.js?v=20260719-2", checkout_page)

        lower_migration = migration.lower()
        self.assertIn("revoke all privileges on table public.profiliai from anon", lower_migration)
        self.assertIn("grant select on table public.profiliai to anon", lower_migration)
        self.assertIn("for insert\n  to authenticated", lower_migration)
        self.assertIn("owner_id = (select auth.uid())", lower_migration)
        self.assertIn("coalesce(aktyvus, false) = false", lower_migration)
        self.assertIn("apmoketa = false", lower_migration)
        self.assertIn("grant update (aktyvus, statusas, apmoketa)", update_grants.lower())

    def test_main_customer_flows_are_simplified(self):
        editor_page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        editor_js = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        checkout_page = (ROOT / "apmokejimas.html").read_text(encoding="utf-8")
        checkout_js = (ROOT / "assets" / "checkout.js").read_text(encoding="utf-8")
        user_js = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        home_js = (ROOT / "assets" / "home.js").read_text(encoding="utf-8")
        grave_js = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        auth = (ROOT / "assets" / "auth.js").read_text(encoding="utf-8")
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")

        self.assertIn('id="editor-photo-details" hidden', editor_page)
        self.assertEqual(editor_page.count("data-photo-description="), 8)
        self.assertIn("updatePhotoDescriptionVisibility", editor_js)
        self.assertIn("data-advanced-layout-toggle", editor_page)
        self.assertIn('id="editor-advanced-layout" hidden', editor_page)
        self.assertIn("setupAdvancedLayout", editor_js)

        self.assertIn('name="city" type="search" list="checkout-city-list"', checkout_page)
        self.assertIn('id="checkout-submit"', checkout_page)
        self.assertNotIn('id="payment-button"', checkout_page)
        self.assertNotIn('name="delivery_confirm"', checkout_page)
        self.assertIn("prefillAccount", checkout_js)
        self.assertIn("startPayment", checkout_js)

        self.assertIn("primaryAction", user_js)
        self.assertIn("user-card-more", user_js)
        self.assertIn("Daugiau veiksmų", user_js)
        self.assertIn("Rekomenduojama", shop)
        self.assertNotIn('id="delivery-option"', shop)

        for number in range(1, 5):
            self.assertIn('data-service-step="{0}"'.format(number), home)
            self.assertIn('data-service-step-button="{0}"'.format(number), home)
        self.assertIn('id="service-saved-grave"', home)
        self.assertIn("activateServiceStep", home_js)
        self.assertIn("setupSavedGraves", home_js)
        self.assertIn("graveName", grave_js)
        self.assertIn("Užsakyti priežiūrą", grave_js)

        self.assertNotIn("Supabase Auth klaida", auth)
        self.assertNotIn("Supabase Storage:", api)
        self.assertNotIn("Užsakymas DB:", editor_js)
        self.assertNotIn('previewCode.textContent = "slug:', editor_js)

    def test_grave_search_has_location_routes_sharing_and_map_preview(self):
        page = (ROOT / "kapu-ieskojimas.html").read_text(encoding="utf-8")
        script = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        self.assertIn("data-use-location", page)
        self.assertIn("data-map-preview", page)
        self.assertIn("data-saved-graves", page)
        self.assertIn("navigator.geolocation.getCurrentPosition", script)
        self.assertIn("distanceKm", script)
        self.assertIn("www.openstreetmap.org/export/embed.html", script)
        self.assertIn("www.google.com/maps/dir/", script)
        self.assertIn("navigator.share", script)
        self.assertIn("atminimas.saved-graves.v1", script)

    def test_memorial_phone_actions_and_moderated_engagement_are_safe(self):
        page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        actions = (ROOT / "assets" / "memorial-actions.js").read_text(encoding="utf-8")
        edge = (ROOT / "supabase" / "functions" / "memorial-engagement" / "index.ts").read_text(encoding="utf-8")
        migration = (ROOT / "supabase" / "migrations" / "20260716173406_memorial_candles_and_memories.sql").read_text(encoding="utf-8")
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        self.assertIn('id="memorial-action-bar"', page)
        self.assertIn('id="memorial-light-candle"', page)
        self.assertIn('id="memorial-memory-form"', page)
        for action in ("share", "copy", "qr", "save", "reminder", "photos"):
            self.assertIn('data-memorial-action="{0}"'.format(action), page)
        self.assertIn("navigator.share", actions)
        self.assertIn("text/calendar", actions)
        self.assertIn("atminimas.saved-memorials.v1", actions)
        self.assertIn('action: "candle"', actions)
        self.assertIn('action: "memory"', actions)
        self.assertIn("crypto.subtle.digest", edge)
        self.assertIn("visitorHash(request, `${id}|candle|${bucket}`)", edge)
        self.assertIn("visitorHash(request, `${id}|memory|${bucket}`)", edge)
        self.assertIn('.eq("status", "approved")', edge)
        self.assertIn("body.consent !== true", edge)
        self.assertIn("alter table public.memorial_candles enable row level security", migration.lower())
        self.assertIn("alter table public.memorial_memories enable row level security", migration.lower())
        self.assertIn("grant select, insert on table public.memorial_candles, public.memorial_memories to service_role", migration.lower())
        self.assertNotRegex(migration.lower(), r"grant\s+[^;]*\bto\s+anon\b")
        self.assertRegex(config, r"(?s)\[functions\.memorial-engagement\]\s*verify_jwt\s*=\s*false")

    def test_legal_pages_cover_location_local_saves_and_memories(self):
        privacy = (ROOT / "privatumas.html").read_text(encoding="utf-8")
        terms = (ROOT / "taisykles.html").read_text(encoding="utf-8")
        accessibility = (ROOT / "prieinamumas.html").read_text(encoding="utf-8")
        self.assertIn("atminimas.saved-memorials.v1", privacy)
        self.assertIn("atminimas.saved-graves.v1", privacy)
        self.assertIn("Vieta, virtualios žvakės ir prisiminimai", privacy)
        self.assertIn("Virtualios žvakės ir lankytojų prisiminimai", terms)
        self.assertIn("mažesnio judesio režimas", accessibility)
        self.assertIn("nuotraukų eiliškumą", accessibility)


if __name__ == "__main__":
    unittest.main(verbosity=2)
