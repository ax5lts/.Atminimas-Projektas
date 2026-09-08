import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PreorderFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = (ROOT / "isankstinis-uzsakymas.html").read_text(encoding="utf-8")
        cls.client = (ROOT / "assets" / "preorder.js").read_text(encoding="utf-8")
        cls.edge = (ROOT / "supabase" / "functions" / "preorder" / "index.ts").read_text(encoding="utf-8")
        migration_paths = sorted((ROOT / "supabase" / "migrations").glob("*_create_preorder_requests.sql"))
        if not migration_paths:
            raise AssertionError("Preorder migration was not created")
        cls.migration = migration_paths[-1].read_text(encoding="utf-8").lower()

    def test_legacy_route_is_a_paid_shop_landing_without_a_submission_form(self):
        self.assertNotIn('id="preorder-form"', self.page)
        self.assertNotIn('assets/preorder.js', self.page)
        self.assertIn('href="parduotuve.html"', self.page)
        self.assertIn('63 €', self.page)

    def test_shop_and_home_offer_paid_orders(self):
        shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('isankstinis-uzsakymas.html', shop)
        self.assertNotIn('PREORDER', home)
        self.assertIn('63 €', home)

    def test_client_uses_edge_function_and_thank_you_receipt(self):
        self.assertIn('"/functions/v1/preorder"', self.client)
        self.assertIn("quantity: 1", self.client)
        self.assertNotIn("values.quantity", self.client)
        self.assertIn('type: "preorder"', self.client)
        self.assertIn('window.location.assign("aciu.html?"', self.client)
        thank_you = (ROOT / "assets" / "thank-you.js").read_text(encoding="utf-8")
        self.assertIn('type === "preorder"', thank_you)
        self.assertIn("mokėtina suma yra 0 EUR", thank_you)
        self.assertIn('params.get("product") === "asa" ? "asa" : "metal"', thank_you)
        self.assertIn('primary.href = "redaktorius.html?product="', thank_you)
        self.assertIn("Pradėti kurti atminimo puslapį", thank_you)

    def test_legacy_endpoint_rejects_new_submissions_without_writes(self):
        self.assertIn('}, 410)', self.edge)
        self.assertIn('shop_url:', self.edge)
        self.assertNotIn('.insert(', self.edge)
        self.assertNotIn('adminClient', self.edge)

    def test_database_is_private_except_for_admin_reads_and_updates(self):
        self.assertIn("alter table public.preorder_requests enable row level security", self.migration)
        self.assertIn("revoke all on table public.preorder_requests", self.migration)
        self.assertIn("grant select, insert, update on table public.preorder_requests to service_role", self.migration)
        self.assertIn("admin reads preorder requests", self.migration)
        self.assertIn("admin updates preorder requests", self.migration)
        self.assertNotIn("grant insert on table public.preorder_requests to anon", self.migration)

    def test_admin_can_review_update_and_export_demand(self):
        page = (ROOT / "admin.html").read_text(encoding="utf-8")
        client = (ROOT / "assets" / "admin.js").read_text(encoding="utf-8")
        self.assertIn('id="admin-preorders"', page)
        self.assertIn('id="preorders-export"', page)
        self.assertIn('"preorder_requests"', client)
        self.assertIn("function exportPreorders()", client)
        self.assertIn("data-save-preorder", client)

    def test_legal_pages_document_preorder_processing(self):
        privacy = (ROOT / "privatumas.html").read_text(encoding="utf-8")
        terms = (ROOT / "taisykles.html").read_text(encoding="utf-8")
        self.assertIn("Ankstesnių išankstinių užsakymų duomenis", privacy)
        self.assertIn("daugiausia 12 mėnesių", privacy)
        self.assertIn("QR lentelės užsakymas apmokamas per Paysera", terms)


if __name__ == "__main__":
    unittest.main()
