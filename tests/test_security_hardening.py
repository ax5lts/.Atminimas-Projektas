import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SecurityHardeningTests(unittest.TestCase):
    def test_every_html_page_has_csp_and_no_inline_javascript(self):
        inline_script = re.compile(
            r"<script(?![^>]*\bsrc\s*=)(?![^>]*\btype=[\"']application/ld\+json[\"'])[^>]*>",
            re.I,
        )
        event_attribute = re.compile(r"<[^>]+\son[a-z]+\s*=", re.I)
        for path in ROOT.glob("*.html"):
            html = path.read_text(encoding="utf-8")
            with self.subTest(page=path.name):
                self.assertIn('http-equiv="Content-Security-Policy"', html)
                self.assertIn("default-src 'self'", html)
                self.assertIn("object-src 'none'", html)
                self.assertIn("script-src 'self';", html)
                self.assertIn("script-src-attr 'none'", html)
                self.assertRegex(html, r'<meta\s+name="referrer"\s+content="(?:strict-origin-when-cross-origin|no-referrer)"')
                self.assertNotRegex(html, inline_script)
                self.assertNotRegex(html, event_attribute)

    def test_server_headers_do_not_allow_inline_scripts(self):
        source = (ROOT / "serve.py").read_text(encoding="utf-8")
        script_directive = re.search(r"script-src[^;]+", source)
        self.assertIsNotNone(script_directive)
        self.assertNotIn("unsafe-inline", script_directive.group(0))
        self.assertIn("script-src-attr 'none'", source)
        self.assertIn('"Cross-Origin-Opener-Policy": "same-origin"', source)
        self.assertIn('"Cross-Origin-Resource-Policy": "same-site"', source)
        self.assertIn('"X-Permitted-Cross-Domain-Policies": "none"', source)

    def test_auth_tokens_are_tab_scoped_and_legacy_copy_is_removed(self):
        auth = (ROOT / "assets" / "auth.js").read_text(encoding="utf-8")
        self.assertIn("sessionStorage.getItem(SESSION_KEY)", auth)
        self.assertIn("sessionStorage.setItem(SESSION_KEY", auth)
        self.assertIn("sessionStorage.removeItem(SESSION_KEY)", auth)
        self.assertIn("localStorage.removeItem(SESSION_KEY)", auth)
        self.assertNotIn("localStorage.setItem(SESSION_KEY", auth)
        self.assertNotIn("localStorage.getItem(SESSION_KEY)", auth)

    def test_password_reset_token_is_removed_from_url_immediately(self):
        source = (ROOT / "assets" / "password-reset.js").read_text(encoding="utf-8")
        read_hash = source.index("window.location.hash")
        scrub_hash = source.index("history.replaceState")
        submit_handler = re.search(r"\.addEventListener\([\"']submit[\"']", source).start()
        self.assertLess(read_hash, scrub_hash)
        self.assertLess(scrub_hash, submit_handler)
        self.assertIn('fetch(authUrl("/logout")', source)

    def test_local_editor_draft_has_a_retention_limit(self):
        source = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        self.assertRegex(source, r"DRAFT_TTL_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000")
        self.assertIn("savedAt", source)
        self.assertIn("discardCurrentDraft", source)

    def test_profile_insert_does_not_request_restricted_columns(self):
        source = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        post_json = source[source.index("async function postJson"):source.index("function absoluteUrl")]
        self.assertIn('Prefer: "return=minimal"', post_json)
        self.assertNotIn('select=*', post_json)
        self.assertNotIn('return=representation', post_json)

    def test_memorial_source_links_only_accept_safe_https(self):
        source = (ROOT / "assets" / "memorial-page.js").read_text(encoding="utf-8")
        self.assertIn("function safeHttpsUrl(value)", source)
        self.assertIn('url.protocol !== "https:"', source)
        self.assertIn("url.username || url.password", source)
        self.assertNotIn("source.href = item.sourceUrl", source)

    def test_profile_management_restricts_paths_and_uses_user_storage_scope(self):
        source = (ROOT / "supabase" / "functions" / "profile-manage" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("segments.length !== 3", source)
        self.assertIn("segments[0] !== ownerId", source)
        self.assertIn("segments[1] !== profileId", source)
        self.assertIn("MEDIA_FILE_PATTERNS", source)
        self.assertIn("safeProfileLayout", source)
        self.assertIn("readJson(request, 256_000)", source)
        self.assertRegex(
            source,
            r'userClient\(token\)\.storage\.from\(\s*"atminimas",?\s*\)\.remove\(stale\)',
        )
        self.assertNotRegex(source, r"\bitem\.url\b")

    def test_public_profile_endpoint_returns_only_sanitized_signed_content(self):
        source = (ROOT / "supabase" / "functions" / "profile-content" / "index.ts").read_text(encoding="utf-8")
        self.assertIn('createSignedUrl(item.path, 3600)', source)
        self.assertIn("safeProfileLayout(profile.layout_json)", source)
        self.assertIn("if (!profile.aktyvus && !canManage)", source)
        self.assertIn("parts[0] !== profileId", source)
        self.assertIn("parts.length !== 2", source)
        self.assertIn("UUID_PATTERN.test(parts[0])", source)
        response = source[source.index("return json({", source.index("const media =")):]
        self.assertNotIn("owner_id:", response)
        self.assertNotIn("deleted_at:", response)
        self.assertNotIn("aktyvus:", response)

    def test_new_paid_orders_are_disabled_server_side(self):
        client = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        edge = (ROOT / "supabase" / "functions" / "profile-manage" / "index.ts").read_text(encoding="utf-8")
        migration = (
            ROOT
            / "supabase"
            / "migrations"
            / "20260730121821_harden_private_profile_media.sql"
        ).read_text(encoding="utf-8").lower()

        self.assertNotIn('action: "create_order"', client)
        self.assertNotIn('postJson("uzsakymai"', client)
        self.assertIn('if (action === "create_order")', edge)
        branch = edge[
            edge.index('if (action === "create_order")'):
            edge.index('if (action === "update")')
        ]
        self.assertIn("payment_enabled: false", branch)
        self.assertIn("preorder_url:", branch)
        self.assertNotIn('.from("product_catalog")', branch)
        self.assertNotIn('.from("uzsakymai")', branch)
        self.assertIn('drop policy if exists "viesas uzsakymu kurimas"', migration)
        self.assertNotRegex(
            migration,
            r"grant\s+insert(?:\s*\([^;]+\))?\s+on\s+(?:table\s+)?public\.uzsakymai",
        )

    def test_admin_prototype_publication_is_server_authorized_and_order_free(self):
        client = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        edge = (ROOT / "supabase" / "functions" / "profile-manage" / "index.ts").read_text(encoding="utf-8")
        admin_page = (ROOT / "admin.html").read_text(encoding="utf-8")

        self.assertIn('id="admin-prototype-link"', admin_page)
        self.assertIn('action: "publish_prototype"', client)
        self.assertIn("publishAdminPrototype", editor)
        self.assertIn('if (action === "publish_prototype")', edge)
        self.assertIn("!isOwner || !await adminAccess(client, user.id)", edge)
        self.assertIn("aktyvus: true", edge)
        self.assertIn("apmoketa: true", edge)
        prototype_branch = edge[
            edge.index('if (action === "publish_prototype")'):
            edge.index('if (action === "create_order")')
        ]
        self.assertNotIn('.from("uzsakymai")', prototype_branch)

    def test_admin_payment_readiness_explains_missing_shipping_prices(self):
        page = (ROOT / "admin.html").read_text(encoding="utf-8")
        script = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        self.assertIn('id="admin-payment-readiness"', page)
        self.assertIn("Išankstinių užsakymų režimas aktyvus", script)
        self.assertIn("klientams mokėjimas ir pristatymo pasirinkimas nerodomi", script)

    def test_public_product_catalog_policy_does_not_read_admin_roles(self):
        migration = (
            ROOT
            / "supabase"
            / "migrations"
            / "20260730132916_optimize_product_catalog_read_policies.sql"
        ).read_text(encoding="utf-8").lower()
        public_policy_start = migration.index(
            'create policy "viesas skaito prieinamus produktus"'
        )
        authenticated_policy_start = migration.index(
            'create policy "prisijunges skaito produktu kataloga"'
        )
        public_policy = migration[public_policy_start:authenticated_policy_start]

        self.assertIn("to anon", public_policy)
        self.assertNotIn("authenticated", public_policy)
        self.assertIn("using (enabled = true)", public_policy)
        self.assertNotIn("user_roles", public_policy)
        authenticated_policy = migration[authenticated_policy_start:]
        self.assertIn("to authenticated", authenticated_policy)
        self.assertIn("enabled = true", authenticated_policy)
        self.assertIn("public.user_roles", authenticated_policy)

    def test_public_shipping_catalog_policy_does_not_read_admin_roles(self):
        migration = (
            ROOT
            / "supabase"
            / "migrations"
            / "20260731173000_fix_shipping_catalog_public_read.sql"
        ).read_text(encoding="utf-8").lower()
        public_policy_start = migration.index(
            'create policy "viesas skaito aktyvius pristatymo budus"'
        )
        authenticated_policy_start = migration.index(
            'create policy "prisijunges skaito pristatymo kataloga"'
        )
        public_policy = migration[public_policy_start:authenticated_policy_start]

        self.assertIn("to anon", public_policy)
        self.assertNotIn("authenticated", public_policy)
        self.assertIn("using (enabled = true)", public_policy)
        self.assertNotIn("user_roles", public_policy)
        authenticated_policy = migration[authenticated_policy_start:]
        self.assertIn("to authenticated", authenticated_policy)
        self.assertIn("enabled = true", authenticated_policy)
        self.assertIn("public.user_roles", authenticated_policy)

    def test_legal_forms_use_the_rate_limited_edge_function(self):
        client = (ROOT / "assets" / "legal-forms.js").read_text(encoding="utf-8")
        edge = (ROOT / "supabase" / "functions" / "legal-submission" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("/functions/v1/legal-submission", client)
        self.assertNotIn("/rest/v1/", client)
        self.assertIn("readJson(request, 16_000)", edge)
        self.assertIn('client.rpc("consume_service_request_rate_limit"', edge)
        self.assertIn('text(body.website, 200)', edge)
        self.assertIn('parsed.protocol !== "https:"', edge)

    def test_database_migration_closes_public_data_paths(self):
        migration = (
            ROOT
            / "supabase"
            / "migrations"
            / "20260730121821_harden_private_profile_media.sql"
        ).read_text(encoding="utf-8").lower()
        self.assertIn("'postgres', 'supabase_admin'", migration)
        self.assertIn("'alter default privileges for role %i", migration)
        self.assertNotIn("when insufficient_privilege", migration)
        self.assertIn("security follow-up required", migration)
        self.assertRegex(
            migration,
            r"revoke\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+public"
            r"\s+from\s+public,\s*anon,\s*authenticated,\s*service_role",
        )
        self.assertRegex(migration, r"update\s+storage\.buckets[\s\S]+public\s*=\s*false")
        self.assertIn("where id in ('atminimas', 'kapavietes')", migration)
        self.assertIn('drop policy if exists "viesas atminimas failu skaitymas"', migration)
        self.assertIn('drop policy if exists "leisti trinti storage testus"', migration)
        self.assertNotRegex(
            migration,
            r"grant\s+[^;]*\bon\s+(?:table\s+)?public\.profiliai\s+to\s+anon",
        )
        self.assertIn("private.normalize_profile_layout_and_text", migration)
        self.assertIn("private.normalize_profile_media_json", migration)
        self.assertIn("alter table public.user_roles enable row level security", migration)
        self.assertIn("using ((select auth.uid()) = user_id)", migration)
        self.assertIn('drop policy if exists "viesas kurimas profiliu"', migration)
        self.assertIn(
            'create policy "prisijunges kuria savo privatu profili"',
            migration,
        )
        self.assertIn("owner_id = (select auth.uid())", migration)
        self.assertIn("coalesce(aktyvus, false) = false", migration)
        self.assertIn("storage.filename(name)", migration)
        self.assertIn("photo-[1-8]", migration)
        self.assertIn('drop policy if exists "viesas skaitymas medijos"', migration)
        self.assertIn('drop policy if exists "anon pateikia sutarties atsisakyma"', migration)
        self.assertIn('drop policy if exists "anon pateikia turinio pranesima"', migration)
        self.assertIn("valid_reference := p_mode = 'payment'", migration)
        self.assertIn("ord.payment_provider = 'stripe'", migration)
        self.assertIn(
            "nullif(ord.payment_reference, '') = nullif(p_object_id, '')",
            migration,
        )
        self.assertIn("and valid_reference", migration)

    def test_manual_grave_draft_photos_are_not_public_objects(self):
        migration = (
            ROOT
            / "supabase"
            / "migrations"
            / "20260730121821_harden_private_profile_media.sql"
        ).read_text(encoding="utf-8").lower()
        edge = (ROOT / "supabase" / "functions" / "grave-photo" / "index.ts").read_text(encoding="utf-8")
        client = (ROOT / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        grant_start = migration.index("grant select (", migration.index("`kapavietes`"))
        grant_end = migration.index("to anon;", grant_start)
        public_grave_grant = migration[grant_start:grant_end]

        self.assertNotIn("nuotraukos_kelias", public_grave_grant)
        self.assertIn("null::text as nuotraukos_kelias", migration)
        self.assertIn("manual_id", edge)
        self.assertIn('statusas: "eq.paskelbtas"', edge)
        self.assertIn("MANUAL_GRAVE_BUCKET", edge)
        self.assertIn("manualGravePhotoUrl(row.id)", client)
        self.assertNotIn('/storage/v1/object/public/" + encodeURIComponent(bucket)', client)

    def test_new_memorial_ids_are_cryptographically_unpredictable(self):
        source = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        identifier = source[source.index("function uniqueIdentifier"):source.index("function fileExt")]
        self.assertIn("new Uint8Array(12)", identifier)
        self.assertIn("global.crypto.getRandomValues(bytes)", identifier)
        self.assertNotIn("Date.now()", identifier)
        self.assertIn('<meta name="robots" content="noindex,nofollow">', page)

    def test_edge_functions_have_explicit_gateway_auth_settings(self):
        config = (ROOT / "supabase" / "config.toml").read_text(encoding="utf-8")
        self.assertRegex(config, r"(?s)\[functions\.profile-manage\]\s*verify_jwt\s*=\s*true")
        self.assertRegex(config, r"(?s)\[functions\.payment-create\]\s*verify_jwt\s*=\s*true")
        self.assertRegex(config, r"(?s)\[functions\.document-download\]\s*verify_jwt\s*=\s*true")
        self.assertRegex(config, r"(?s)\[functions\.production-email\]\s*verify_jwt\s*=\s*true")
        self.assertRegex(config, r"(?s)\[functions\.shipping-create\]\s*verify_jwt\s*=\s*true")
        self.assertRegex(config, r"(?s)\[functions\.profile-content\]\s*verify_jwt\s*=\s*false")
        self.assertRegex(config, r"(?s)\[functions\.legal-submission\]\s*verify_jwt\s*=\s*false")
        self.assertIn('password_requirements = "lower_upper_letters_digits_symbols"', config)

    def test_sensitive_edge_requests_are_bounded_and_internal_errors_are_hidden(self):
        payment = (ROOT / "supabase" / "functions" / "payment-create" / "index.ts").read_text(encoding="utf-8")
        shipping = (ROOT / "supabase" / "functions" / "shipping-create" / "index.ts").read_text(encoding="utf-8")
        shipping_adapter = (
            ROOT / "supabase" / "functions" / "_shared" / "shipping.ts"
        ).read_text(encoding="utf-8")
        service = (ROOT / "supabase" / "functions" / "service-flow" / "index.ts").read_text(encoding="utf-8")
        engagement = (ROOT / "supabase" / "functions" / "memorial-engagement" / "index.ts").read_text(encoding="utf-8")
        webhook = (ROOT / "supabase" / "functions" / "payment-webhook" / "index.ts").read_text(encoding="utf-8")

        self.assertIn("payment_enabled: false", payment)
        self.assertIn("preorder_url:", payment)
        self.assertIn("}, 409);", payment)
        self.assertNotIn("checkout.stripe.com", payment)
        self.assertNotIn("STRIPE_SECRET_KEY", payment)
        self.assertIn("readJson(request, 8_000)", shipping)
        self.assertIn("order: adapterOrder(order)", shipping_adapter)
        self.assertNotIn("JSON.stringify(data)", shipping_adapter)
        self.assertIn("safeTrackingUrl(data.tracking_url)", shipping_adapter)
        self.assertIn("readJson(request, 64_000)", service)
        self.assertIn("readJson(request, 12_000)", engagement)
        self.assertIn("declaredLength > 1_000_000", webhook)
        self.assertIn('return json({ error: "Paslaugos veiksmas nepavyko" }, 500)', service)
        self.assertIn('return json({ error: "Webhook processing failed" }, 500)', webhook)

    def test_github_pages_auto_deploys_main_after_security_tests(self):
        workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
        expected = (
            "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
            "actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b",
            "actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b",
            "actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
        )
        for action in expected:
            self.assertIn(action, workflow)
        tests_at = workflow.index('python -m unittest discover -s tests -p "test_*.py" -v')
        artifact_at = workflow.index("actions/upload-pages-artifact@")
        self.assertLess(tests_at, artifact_at)
        self.assertRegex(workflow, r"(?m)^\s{2}push:\s*$")
        self.assertRegex(workflow, r"(?m)^\s{6}- main\s*$")
        self.assertIn("github.event_name == 'push' || inputs.backend_ready", workflow)
        self.assertTrue((ROOT / ".github" / "dependabot.yml").is_file())

    def test_repository_does_not_contain_common_secret_value_patterns(self):
        patterns = (
            re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b"),
            re.compile(r"\bsb_secret_[A-Za-z0-9._-]{16,}\b"),
            re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        )
        extensions = {".html", ".js", ".css", ".py", ".sql", ".toml", ".yml", ".yaml", ".md"}
        ignored_parts = {".git", ".codex-remote-attachments", ".net bankas", "tmp", "__pycache__"}
        for path in ROOT.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in extensions:
                continue
            if ignored_parts.intersection(path.parts):
                continue
            source = path.read_text(encoding="utf-8", errors="ignore")
            for pattern in patterns:
                with self.subTest(path=str(path.relative_to(ROOT)), pattern=pattern.pattern):
                    self.assertNotRegex(source, pattern)


if __name__ == "__main__":
    unittest.main()
