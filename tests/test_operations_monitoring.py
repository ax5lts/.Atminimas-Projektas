import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


class OperationsMonitoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migration = read(
            "supabase/migrations/20260808165000_operations_monitoring.sql"
        )
        cls.email = read("supabase/functions/_shared/email.ts")
        cls.vault_auth = read(
            "supabase/migrations/20260808171500_ops_monitor_vault_auth.sql"
        )
        cls.resend_vault = read(
            "supabase/migrations/20260808173000_resend_webhook_vault.sql"
        )
        cls.webhook = read("supabase/functions/resend-webhook/index.ts")
        cls.monitor = read("supabase/functions/ops-monitor/index.ts")
        cls.assistant = read("supabase/functions/ops-assistant/index.ts")
        cls.config = read("supabase/config.toml")
        cls.admin_html = read("admin.html")
        cls.admin_js = read("assets/admin.js")

    def test_operations_tables_are_rls_protected_and_admin_read_only(self):
        tables = [
            "ops_monitor_runs",
            "email_messages",
            "email_delivery_events",
            "ops_alerts",
            "system_health_checks",
            "ops_daily_snapshots",
        ]
        for table in tables:
            self.assertIn(f"public.{table}", self.migration)
            self.assertIn(
                f"alter table public.{table} enable row level security",
                self.migration,
            )
        self.assertIn("from public, anon, authenticated", self.migration)
        self.assertIn("to authenticated", self.migration)
        self.assertIn("to service_role", self.migration)
        self.assertNotIn("grant insert on public.email_messages to authenticated", self.migration)

    def test_schema_has_constraints_indexes_retention_and_scalable_metrics(self):
        self.assertIn("recipient_hash ~ '^[a-f0-9]{64}$'", self.migration)
        self.assertIn("email_messages_problem_idx", self.migration)
        self.assertIn("where status = 'open'", self.migration)
        self.assertIn("ops_collect_metrics", self.migration)
        self.assertIn("cleanup_ops_history", self.migration)
        self.assertIn("interval '90 days'", self.migration)

    def test_cron_secret_is_read_from_vault(self):
        self.assertIn("vault.decrypted_secrets", self.migration)
        self.assertIn("ops_monitor_url", self.migration)
        self.assertIn("ops_monitor_secret", self.migration)
        self.assertIn("*/5 * * * *", self.migration)
        self.assertNotIn("tpwrkgdmtucecqxbpwwf", self.migration)
        self.assertIn("verify_ops_monitor_secret", self.vault_auth)
        self.assertIn("to service_role", self.vault_auth)

    def test_outbound_email_is_logged_without_plain_recipient(self):
        self.assertIn('from("email_messages")', self.email)
        self.assertIn("maskEmail(normalizedRecipient)", self.email)
        self.assertIn("sha256Hex(normalizedRecipient)", self.email)
        self.assertIn("provider_email_id: providerId", self.email)
        self.assertIn('"Idempotency-Key": idempotencyKey', self.email)
        self.assertNotIn("recipient_email: normalizedRecipient", self.email)

    def test_resend_webhook_verifies_raw_payload_and_deduplicates(self):
        self.assertIn('from "npm:svix@1.99.1"', self.webhook)
        self.assertIn("const rawBody = await request.text()", self.webhook)
        self.assertIn(".verify(rawBody", self.webhook)
        self.assertIn('eventError?.code === "23505"', self.webhook)
        self.assertIn("new Date(eventAt).valueOf() >= previousAt", self.webhook)
        self.assertIn("email_delivery_events", self.webhook)
        self.assertIn("get_resend_webhook_secret", self.webhook)
        self.assertIn("store_resend_webhook_config", self.resend_vault)
        self.assertIn("to service_role", self.resend_vault)
        self.assertNotIn("console.log(rawBody", self.webhook)

    def test_monitor_is_secret_protected_and_does_not_send_data_to_ai(self):
        self.assertIn('env("OPS_MONITOR_SECRET", false)', self.monitor)
        self.assertIn("constantTimeEqual(expected, received)", self.monitor)
        self.assertIn('client.rpc("ops_collect_metrics")', self.monitor)
        self.assertIn("system_health_checks", self.monitor)
        self.assertIn("resolveMissing(seen)", self.monitor)
        self.assertIn("ensureResendWebhook()", self.monitor)
        self.assertIn('"email.delivered"', self.monitor)
        self.assertNotIn("api.openai.com", self.monitor)

    def test_ai_assistant_is_admin_only_read_only_and_has_fallback(self):
        self.assertIn("await requireUser(request)", self.assistant)
        self.assertIn('.eq("role", "admin")', self.assistant)
        self.assertIn('"https://api.openai.com/v1/responses"', self.assistant)
        self.assertIn("store: false", self.assistant)
        self.assertIn("fallbackAnswer(context)", self.assistant)
        self.assertIn("Tu turi tik skaitymo teisę", self.assistant)
        self.assertNotIn('.from("uzsakymai").update', self.assistant)
        self.assertNotIn('.from("uzsakymai").delete', self.assistant)

    def test_admin_ui_shows_health_alerts_email_delivery_and_ai_question(self):
        for identifier in [
            'id="admin-ops"',
            'id="ops-alert-rows"',
            'id="ops-email-rows"',
            'id="ops-assistant-form"',
            'id="ops-question"',
        ]:
            self.assertIn(identifier, self.admin_html)
        self.assertIn('restUrl("ops_alerts"', self.admin_js)
        self.assertIn('restUrl("email_messages"', self.admin_js)
        self.assertIn('functionUrl("ops-assistant")', self.admin_js)
        self.assertNotIn("OPENAI_API_KEY", self.admin_js)
        self.assertNotIn("OPS_MONITOR_SECRET", self.admin_js)

    def test_edge_function_jwt_configuration(self):
        expected = {
            "resend-webhook": "false",
            "ops-monitor": "false",
            "ops-assistant": "true",
        }
        for name, value in expected.items():
            block = self.config.split(f"[functions.{name}]", 1)[1].split("[", 1)[0]
            self.assertIn(f"verify_jwt = {value}", block)


if __name__ == "__main__":
    unittest.main()
