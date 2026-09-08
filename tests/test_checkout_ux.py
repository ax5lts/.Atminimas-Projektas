import unittest
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]

class Elements(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.ids = []
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == "id": self.ids.append(value)

class PaidCheckoutContractTests(unittest.TestCase):
    def test_checkout_contains_unique_elements_required_by_its_client(self):
        import re
        page = (ROOT / "apmokejimas.html").read_text(encoding="utf-8")
        client = (ROOT / "assets/checkout.js").read_text(encoding="utf-8")
        ids = Elements(page).ids
        self.assertEqual(len(ids), len(set(ids)))
        for identifier in re.findall(r'getElementById\("([^"]+)"\)', client):
            self.assertIn(identifier, ids)
        self.assertIn('assets/checkout.js', page)
        self.assertNotIn('preorder-only-title', page)

    def test_paid_endpoint_requires_authenticated_server_checkout(self):
        endpoint = (ROOT / "supabase/functions/payment-create/index.ts").read_text(encoding="utf-8")
        self.assertIn('startProductPayment', endpoint)
        self.assertNotIn('payment_enabled: false', endpoint)
        self.assertNotIn('stripe', endpoint.lower())

if __name__ == "__main__":
    unittest.main()
