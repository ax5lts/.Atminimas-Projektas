import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DigitalPageFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.shop = (ROOT / "parduotuve.html").read_text(encoding="utf-8")
        cls.preorder = (ROOT / "isankstinis-uzsakymas.html").read_text(encoding="utf-8")
        cls.editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        cls.user_page = (ROOT / "vartotojas.html").read_text(encoding="utf-8")
        cls.user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        cls.styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")

    def test_digital_only_entry_is_visible_across_the_journey(self):
        link = 'href="redaktorius.html?product=digital"'
        self.assertIn(link, self.home)
        self.assertIn(link, self.shop)
        self.assertIn(link, self.preorder)
        self.assertIn("Lentelė, pristatymas ir PREORDER nebus kuriami", self.shop)
        self.assertIn("PREORDER galima praleisti", self.preorder)
        self.assertIn(".digital-page-offer", self.styles)

    def test_editor_preserves_digital_mode_through_login_and_save(self):
        self.assertIn('if (value === "digital") return "digital"', self.editor)
        self.assertIn('requestedProductType !== "digital"', self.editor)
        self.assertIn('return "redaktorius.html?product=" + encodeURIComponent(productType) + "&resume=save"', self.editor)
        self.assertIn('var digitalOnly = productType === "digital"', self.editor)
        self.assertIn('preorderLink.hidden = digitalOnly', self.editor)
        self.assertIn('clientLink.textContent = digitalOnly ? "Paskelbti ir gauti QR"', self.editor)
        self.assertIn("redirectToLoginForSave();", self.editor)
        self.assertIn("if (AtminimasAuth.signOut) AtminimasAuth.signOut();", self.editor)

    def test_client_zone_publishes_then_offers_qr_without_an_order(self):
        self.assertIn('id="user-create" hidden>Kurti naują puslapį</a>', self.user_page)
        self.assertIn('id="user-preorder" hidden>QR lentelės PREORDER</a>', self.user_page)
        self.assertIn("Paskelbti ir gauti QR", self.user)
        self.assertIn("Atsisiųsti QR kodą", self.user)
        self.assertIn("Skaitmeninis atminimo puslapis · be fizinio gaminio", self.user)
        self.assertIn("QR kodą jau galite atsisiųsti", self.user)

    def test_network_failure_message_is_localized(self):
        preorder_client = (ROOT / "assets" / "preorder.js").read_text(encoding="utf-8")
        self.assertIn("Nepavyko susisiekti su PREORDER serveriu", preorder_client)
        self.assertIn("Užsakymas neišsaugotas", preorder_client)


if __name__ == "__main__":
    unittest.main()
