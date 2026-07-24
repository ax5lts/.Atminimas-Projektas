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
        self.assertIn("(result.user && result.user.email) || data.email", register)
        self.assertNotIn("|| email;", register)
        self.assertIn('resendButton.setAttribute("aria-busy", "true")', register)
        self.assertIn("setResendBusy(false)", register)
        self.assertNotIn("} finally {\n      setBusy(false);", register)

    def test_auth_validation_waits_for_blur_or_submit(self):
        validator = (ROOT / "assets" / "form-validation.js").read_text(encoding="utf-8")
        styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
        pages = {
            "prisijungti.html": "assets/login.js",
            "registruotis.html": "assets/register.js",
            "slaptazodis.html": "assets/password-reset.js",
        }

        for filename, page_script in pages.items():
            with self.subTest(page=filename):
                page = (ROOT / filename).read_text(encoding="utf-8")
                self.assertIn("data-friendly-validation", page)
                self.assertNotIn("data-friendly-validation novalidate", page)
                self.assertIn("assets/form-validation.js?v=", page)
                self.assertLess(page.index("assets/form-validation.js"), page.index(page_script))

        self.assertIn("form.noValidate = true", validator)
        self.assertIn('form.addEventListener("input"', validator)
        self.assertIn('form.addEventListener("focusout"', validator)
        self.assertIn('form.addEventListener("submit"', validator)
        self.assertIn('field.dataset.wasEdited = "true"', validator)
        self.assertIn('field.dataset.wasEdited !== "true"', validator)
        self.assertIn('field.dataset.validateLive = "true"', validator)
        self.assertIn('field.dataset.validateLive === "true"', validator)
        self.assertIn('field.matches(".password-toggle")', validator)
        self.assertIn('toggleControl.querySelector("input")', validator)
        self.assertIn("field.value.length < field.minLength", validator)
        self.assertIn('"Įrašykite bent " + field.minLength + " simbolių."', validator)
        self.assertIn("clearFieldError(field)", validator)
        self.assertIn('field.setAttribute("aria-invalid", "true")', validator)
        self.assertIn('field.setAttribute("aria-describedby"', validator)
        self.assertIn("event.stopImmediatePropagation()", validator)
        self.assertNotIn("reportValidity", validator)
        self.assertIn(".form-field-error", styles)
        self.assertIn(".form-field-suggestion", styles)
        self.assertIn(".form-field.has-success", styles)
        self.assertIn('[aria-invalid="true"]', styles)
        self.assertIn('.form-status[data-state="error"]', styles)
        self.assertIn('function suggestedEmail(value)', validator)
        self.assertIn('"gamil.com": "gmail.com"', validator)
        self.assertIn('fixButton.textContent = "Pataisyti"', validator)
        self.assertIn('keepButton.textContent = "Palikti kaip įvesta"', validator)
        self.assertIn("showFieldSuccess(field)", validator)

    def test_auth_password_rules_and_visibility_are_consistent(self):
        login_page = (ROOT / "prisijungti.html").read_text(encoding="utf-8")
        reset_script = (ROOT / "assets" / "password-reset.js").read_text(encoding="utf-8")
        validator = (ROOT / "assets" / "form-validation.js").read_text(encoding="utf-8")

        self.assertNotIn('autocomplete="current-password" minlength=', login_page)
        self.assertIn("bent 12 ženklų slaptažodį", reset_script)
        self.assertIn('toggle.textContent = "Rodyti"', validator)
        self.assertIn('toggle.textContent = show ? "Slėpti" : "Rodyti"', validator)
        self.assertIn('toggle.setAttribute("aria-pressed"', validator)
        self.assertIn('field.name === "password" || field.type === "password"', validator)

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
        self.assertIn('aria-current="step"', shop)
        self.assertIn('id="shop-catalog-retry"', shop)
        self.assertIn('class="product-order-summary"', shop)
        self.assertIn('createLink.setAttribute("aria-disabled", "true")', script)
        self.assertIn('products.metal.price = "–"', script)


if __name__ == "__main__":
    unittest.main()
