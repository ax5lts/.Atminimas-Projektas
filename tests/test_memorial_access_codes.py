import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260808114953_memorial_access_codes.sql"
)


class MemorialAccessCodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.editor_page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        cls.editor = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        cls.public_page = (ROOT / "sablonas-viskas.html").read_text(encoding="utf-8")
        cls.memorial = (ROOT / "assets" / "memorial-page.js").read_text(encoding="utf-8")
        cls.api = (ROOT / "assets" / "atminimas-duomenys.js").read_text(encoding="utf-8")
        cls.profile_content = (
            ROOT / "supabase" / "functions" / "profile-content" / "index.ts"
        ).read_text(encoding="utf-8")
        cls.profile_manage = (
            ROOT / "supabase" / "functions" / "profile-manage" / "index.ts"
        ).read_text(encoding="utf-8")
        cls.user = (ROOT / "assets" / "user.js").read_text(encoding="utf-8")
        cls.migration = MIGRATION.read_text(encoding="utf-8").lower()

    def test_editor_has_public_or_protected_choice_and_exact_help(self):
        self.assertIn("Ar norite apsaugoti atminimo puslapį prieigos kodu?", self.editor_page)
        self.assertRegex(
            self.editor_page,
            r'name="access_protected" value="no" checked[\s\S]+?Puslapis bus viešas',
        )
        self.assertRegex(
            self.editor_page,
            r'name="access_protected" value="yes"[\s\S]+?Puslapis bus apsaugotas prieigos kodu',
        )
        self.assertIn("Sukurkite prieigos kodą", self.editor_page)
        self.assertIn("Pakartokite prieigos kodą", self.editor_page)
        self.assertIn('pattern="[0-9]{5,6}"', self.editor_page)
        self.assertIn("data-access-code-toggle", self.editor_page)
        self.assertIn(
            "Šio kodo reikės norint peržiūrėti privatų atminimo puslapį. "
            "Pasirinkite kodą, kurį lengvai prisiminsite, tačiau kurį būtų sunku atspėti kitiems.",
            self.editor_page,
        )

    def test_client_and_server_enforce_matching_length_and_weak_codes(self):
        for source in (self.editor, self.profile_manage):
            self.assertIn("Prieigos kodą turi sudaryti bent 5 skaitmenys.", source)
            self.assertIn("Šis prieigos kodas per silpnas.", source)
        self.assertIn("Prieigos kodai nesutampa.", self.editor)
        self.assertIn('"0123456789"', self.editor)
        self.assertIn('"9876543210"', self.editor)
        self.assertIn("private.is_weak_memorial_access_code", self.migration)

    def test_only_an_adaptive_salted_hash_is_persisted(self):
        self.assertIn("access_code_hash text", self.migration)
        self.assertIn("extensions.crypt(", self.migration)
        self.assertIn("extensions.gen_salt('bf', 12)", self.migration)
        self.assertNotRegex(self.migration, r"add column[^;]*\baccess_code\s+text")
        self.assertIn("revoke select on table public.profiliai from authenticated", self.migration)
        self.assertIn('restUrl(table, "select=id")', self.api)
        self.assertNotIn('restUrl(table, "select=*")', self.api)
        self.assertNotIn("access_code_hash:", self.profile_content)
        response_shape = self.profile_content[self.profile_content.index("return json({\n      atminimas:"):]
        self.assertNotIn("access_code_hash", response_shape)

    def test_private_qr_opens_a_code_gate_and_code_never_enters_url(self):
        self.assertIn("Šis atminimo puslapis yra privatus.", self.public_page)
        self.assertIn("Įveskite prieigos kodą.", self.public_page)
        self.assertIn("Pamiršote prieigos kodą?", self.public_page)
        self.assertIn("Atidaryti", self.public_page)
        self.assertIn('method: "POST"', self.api)
        self.assertIn('body: JSON.stringify({ access_code:', self.api)
        self.assertNotRegex(self.api, r"searchParams\.set\([^\n]*access_code")
        self.assertIn("encodeURIComponent(pageUrl)", self.profile_manage)
        self.assertNotRegex(self.profile_manage, r"qrUrl[^;]+access_code")

    def test_verification_is_server_only_and_rate_limited(self):
        self.assertIn("verify_memorial_access_code", self.profile_content)
        self.assertIn("to service_role", self.migration)
        self.assertRegex(
            self.migration,
            r"revoke all on function public\.verify_memorial_access_code[\s\S]+?from public, anon, authenticated",
        )
        self.assertIn("five failed", self.migration)
        self.assertIn("interval '15 minutes'", self.migration)
        self.assertIn('code: "ACCESS_CODE_RATE_LIMITED"', self.profile_content)

    def test_forgotten_code_is_replaced_after_owner_reauthentication(self):
        self.assertIn("Seno prieigos kodo parodyti negalime.", self.user)
        self.assertIn("Paskyros slaptažodis", self.user)
        self.assertIn("await AtminimasAuth.signIn(me.email, accountPassword);", self.user)
        self.assertIn('action: "set_access_code"', self.user)
        self.assertIn("Senojo kodo naudoti nebegalima.", self.user)
        self.assertNotRegex(self.user, r"(?:show|return|get)[A-Za-z_]*AccessCode")


if __name__ == "__main__":
    unittest.main()
