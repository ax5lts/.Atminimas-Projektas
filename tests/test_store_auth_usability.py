import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StoreAuthUsabilityTests(unittest.TestCase):
    def test_auth_refreshes_and_retries_protected_requests(self):
        auth = (ROOT / "assets" / "auth.js").read_text(encoding="utf-8")
        self.assertIn('grant_type=refresh_token', auth)
        self.assertIn("var refreshPromise = null", auth)
        self.assertIn("async function ensureFreshSession()", auth)
        self.assertIn("async function authorizedFetch(url, options)", auth)
        self.assertIn("response.status !== 401", auth)
        self.assertIn("if (!latest) return null;", auth)
        self.assertIn("latest.refresh_token !== current.refresh_token", auth)
        self.assertIn("refreshSession: refreshSession", auth)

    def test_signup_has_redirect_and_resend_confirmation(self):
        auth = (ROOT / "assets" / "auth.js").read_text(encoding="utf-8")
        register = (ROOT / "assets" / "register.js").read_text(encoding="utf-8")
        page = (ROOT / "registruotis.html").read_text(encoding="utf-8")
        self.assertIn('/auth/v1/signup?redirect_to=', auth)
        self.assertIn('/auth/v1/resend?redirect_to=', auth)
        self.assertIn("resendSignupConfirmation", auth)
        self.assertIn("function safeNextPage()", auth)
        self.assertIn('redirect.searchParams.set("next", next)', auth)
        self.assertIn('redirect.searchParams.set("auth_state", state)', auth)
        self.assertIn("providedState === expectedState", auth)
        self.assertIn('id="register-confirmation"', page)
        self.assertIn('aria-live="polite" tabindex="-1"', page)
        self.assertIn('id="register-resend"', page)
        self.assertIn("confirmation.focus({ preventScroll: true })", register)
        self.assertIn("AtminimasAuth.resendSignupConfirmation(pendingEmail)", register)

    def test_editor_data_requests_use_fresh_session(self):
        api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        self.assertIn("global.AtminimasAuth.authorizedFetch", api)
        self.assertIn("return global.AtminimasAuth.authorizedFetch(url, options)", api)
        self.assertIn("function apiFetch(url, options)", user)
        self.assertNotIn("await fetch(", user)

    def test_shop_is_a_clear_fail_closed_journey(self):
        catalog = (ROOT / "assets" / "product-catalog.js").read_text(encoding="utf-8")
        shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        script = (ROOT / "assets" / "shop.js").read_text(encoding="utf-8")
        self.assertIn('metal: { id: "metal", available: false', catalog)
        self.assertIn('class="shop-journey"', shop)
        self.assertIn('id="shop-catalog-retry"', shop)
        self.assertIn('class="product-order-summary"', shop)
        self.assertIn('createLink.setAttribute("aria-disabled", "true")', script)
        self.assertIn('products.metal.price = "–"', script)


if __name__ == "__main__":
    unittest.main()
