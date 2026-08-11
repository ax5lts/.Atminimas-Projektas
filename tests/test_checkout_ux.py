import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CheckoutUxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = (ROOT / "apmokejimas.html").read_text(encoding="utf-8")
        cls.script = (ROOT / "assets" / "checkout.js").read_text(encoding="utf-8")
        cls.styles = (ROOT / "css" / "checkout-ux.css").read_text(encoding="utf-8")

    def test_checkout_loads_only_active_shipping_catalog_entries(self):
        self.assertIn('id="checkout-carrier"', self.page)
        self.assertNotIn('<option value="Omniva">', self.page)
        self.assertNotIn('<option value="LP Express">', self.page)
        self.assertNotIn('<option value="DPD">', self.page)
        self.assertIn(
            "shipping_catalog?select=carrier,price_cents,currency,enabled&enabled=eq.true",
            self.script,
        )
        self.assertIn("row.enabled !== true", self.script)
        self.assertIn('method.carrier + " — " + money(method.price_cents, method.currency)', self.script)

    def test_unavailable_shipping_has_a_safe_retry_state(self):
        self.assertIn('id="shipping-options-status"', self.page)
        self.assertIn('id="shipping-options-retry"', self.page)
        self.assertIn("Šiuo metu nėra aktyvaus pristatymo būdo.", self.script)
        self.assertIn("Pristatymo būdų įkelti nepavyko.", self.script)
        self.assertIn('setShippingState(', self.script)
        self.assertIn('shippingRetry.addEventListener("click"', self.script)
        self.assertIn("!shippingCatalogReady", self.script)

    def test_locker_picker_supports_search_retry_and_stale_request_protection(self):
        self.assertIn('id="checkout-locker-search"', self.page)
        self.assertIn('aria-controls="checkout-terminal"', self.page)
        self.assertIn('id="locker-retry"', self.page)
        self.assertIn('lockerSearch.addEventListener("input"', self.script)
        self.assertIn("requestId !== lockerRequestId", self.script)
        self.assertIn("function failLockerLoad()", self.script)
        self.assertIn("selectedLockerExists", self.script)
        self.assertIn("Pasirinkite paštomatą iš pateikto sąrašo.", self.script)

    def test_payment_success_explains_production_approval(self):
        self.assertIn('id="payment-success"', self.page)
        self.assertIn('id="payment-success-action"', self.page)
        self.assertIn('params.get("payment") !== "success"', self.script)
        self.assertIn("Apmokėjimas patvirtintas", self.script)
        self.assertIn("Patvirtinti gamybai", self.script)
        self.assertIn("Stebėti užsakymo būseną", self.script)
        self.assertIn('"vartotojas.html?order="', self.script)

    def test_checkout_keeps_authenticated_owner_scoping(self):
        self.assertIn("AtminimasAuth.accessToken()", self.script)
        self.assertIn("var me = await AtminimasAuth.user()", self.script)
        self.assertIn("AtminimasAuth.authorizedFetch", self.script)
        self.assertIn("AtminimasAuth.ensureFreshSession()", self.script)
        self.assertIn('"uzsakymai?id=eq." + encodeURIComponent(orderId)', self.script)
        self.assertIn("{ headers: AtminimasAuth.headers(false) }", self.script)
        self.assertIn('rest("rpc/set_my_order_delivery")', self.script)
        self.assertIn("order_id: orderId", self.script)

    def test_checkout_specific_styles_are_connected_and_accessible(self):
        self.assertRegex(self.page, r'href="css/checkout-ux\.css\?v=\d{8}-\d+"')
        self.assertIn(".checkout-success:focus", self.styles)
        self.assertIn(".checkout-form select:focus-visible", self.styles)
        self.assertIn('.checkout-inline-state[data-state="error"]', self.styles)
        self.assertIn("@media (max-width: 640px)", self.styles)


if __name__ == "__main__":
    unittest.main(verbosity=2)
