import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PreorderOnlyUxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = (ROOT / "apmokejimas.html").read_text(encoding="utf-8")
        cls.payment = (
            ROOT / "supabase" / "functions" / "payment-create" / "index.ts"
        ).read_text(encoding="utf-8")
        cls.profile = (
            ROOT / "supabase" / "functions" / "profile-manage" / "index.ts"
        ).read_text(encoding="utf-8")

    def test_legacy_checkout_page_is_a_preorder_only_notice(self):
        self.assertIn('id="preorder-only-title"', self.page)
        self.assertIn("Dabar priimame tik išankstinius užsakymus", self.page)
        self.assertIn("0 €", self.page)
        self.assertIn('href="isankstinis-uzsakymas.html"', self.page)
        self.assertIn('<meta name="robots" content="noindex,follow">', self.page)

    def test_legacy_page_cannot_collect_delivery_or_payment_data(self):
        self.assertNotIn('id="delivery-form"', self.page)
        self.assertNotIn('id="checkout-submit"', self.page)
        self.assertNotIn('name="parcel_terminal"', self.page)
        self.assertNotIn('assets/checkout.js', self.page)
        self.assertNotIn('css/checkout-ux.css', self.page)

    def test_product_payment_endpoint_is_explicitly_disabled(self):
        self.assertIn("payment_enabled: false", self.payment)
        self.assertIn("preorder_url:", self.payment)
        self.assertIn("}, 409);", self.payment)
        self.assertNotIn("STRIPE_SECRET_KEY", self.payment)
        self.assertNotIn("checkout.stripe.com", self.payment)
        self.assertNotIn("api.stripe.com", self.payment)

    def test_old_client_cannot_create_a_new_paid_order(self):
        start = self.profile.index('if (action === "create_order")')
        end = self.profile.index('if (action === "update")', start)
        branch = self.profile[start:end]
        self.assertIn("payment_enabled: false", branch)
        self.assertIn("preorder_url:", branch)
        self.assertIn("}, 409);", branch)
        self.assertNotIn('.from("uzsakymai")', branch)
        self.assertNotIn('.from("product_catalog")', branch)


if __name__ == "__main__":
    unittest.main(verbosity=2)
