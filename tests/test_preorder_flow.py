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

    def test_public_form_is_clear_and_non_binding(self):
        self.assertIn('id="preorder-form"', self.page)
        self.assertIn('name="product_type"', self.page)
        self.assertIn('name="customer_email"', self.page)
        self.assertNotIn('name="quantity"', self.page)
        self.assertNotIn(">Kiekis", self.page)
        self.assertIn('name="consent" value="yes" required', self.page)
        self.assertIn('name="website"', self.page)
        self.assertIn("šio PREORDER suma yra 0 EUR", self.page)
        self.assertIn("Tai nėra pirkimo sutartis", self.page)

    def test_shop_and_home_link_to_preorder(self):
        shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="isankstinis-uzsakymas.html?product=metal"', shop)
        self.assertIn(">Pateikti PREORDER · 0 € dabar</a>", shop)
        self.assertIn('href="isankstinis-uzsakymas.html?product=metal"', home)
        self.assertNotIn("Saugiai apmokėkite", shop)

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

    def test_edge_validates_and_rate_limits_before_service_role_insert(self):
        self.assertIn('body.consent !== "yes"', self.edge)
        self.assertIn("consume_service_request_rate_limit", self.edge)
        self.assertIn('text(body.website, 200)', self.edge)
        self.assertIn('(count || 0) >= 3', self.edge)
        self.assertIn('.from("preorder_requests").insert(', self.edge)
        self.assertIn("payment_taken: false", self.edge)
        self.assertIn("const quantity = 1;", self.edge)
        self.assertNotIn("Number(body.quantity)", self.edge)

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
        self.assertIn("Išankstinio užsakymo duomenis", privacy)
        self.assertIn("daugiausia 12 mėnesių", privacy)
        self.assertIn("neįpareigojanti rezervacija", terms)


if __name__ == "__main__":
    unittest.main()
