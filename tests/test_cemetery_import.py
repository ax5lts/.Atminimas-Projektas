import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace

from import_cemetery_data import HttpClient, Importer, clean, normalized, parse_date, parse_number, point_coordinates

ROOT = Path(__file__).resolve().parent
NOW = "2026-07-13T12:00:00+00:00"
MUNICIPALITY = "00000000-0000-0000-0000-000000000001"
CEMETERY = "00000000-0000-0000-0000-000000000002"
GRAVE = "00000000-0000-0000-0000-000000000003"


def fixture_rows(name):
    stream, reader, headers = Importer.reader(ROOT / ("fixture_" + name + ".csv"))
    try: return list(reader), headers
    finally: stream.close()


class FakeDb:
    def __init__(self): self.tables = {}
    def upsert(self, table, payload, conflict):
        store = self.tables.setdefault(table, {}); keys = conflict.split(","); result = []
        for row in payload:
            key = tuple(row.get(name) for name in keys); merged = dict(store.get(key, {})); merged.update(row)
            merged.setdefault("id", "id-" + str(len(store) + 1)); store[key] = merged; result.append(merged)
        return result


class ResponseHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/error": self.send_response(500); self.end_headers(); return
        if self.path == "/html":
            body = b"<!doctype html><html>error</html>"; self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(body); return
        body = b"a,b\n1,2\n"; self.send_response(200); self.send_header("Content-Type", "text/csv; charset=utf-8"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *args): pass


class CemeteryImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), ResponseHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.base = "http://127.0.0.1:{0}".format(cls.server.server_port)
    @classmethod
    def tearDownClass(cls): cls.server.shutdown(); cls.server.server_close()
    def importer(self):
        value = Importer.__new__(Importer); value.base_url = "https://example.invalid"; value.args = SimpleNamespace(limit=None, force=False); return value

    def test_graves_csv_import_payload(self):
        payload = self.importer().grave_payload(fixture_rows("graves")[0][0], MUNICIPALITY, CEMETERY, NOW)
        self.assertEqual(payload["grave_source_id"], "SLC-1-2-3"); self.assertEqual(payload["area_m2"], 3.0); self.assertEqual(payload["cemetery_id"], CEMETERY)
    def test_deceased_csv_import_payload(self):
        payload = self.importer().deceased_payload(fixture_rows("deceased")[0][0], MUNICIPALITY, {"SLC-1-2-3": {"id": GRAVE, "cemetery_id": CEMETERY}}, NOW)
        self.assertEqual(payload["first_name"], "Živilė"); self.assertEqual(payload["grave_id"], GRAVE)
    def test_utf8_lithuanian_name(self): self.assertEqual(fixture_rows("deceased")[0][0]["pavarde"], "Žukauskienė")
    def test_empty_optional_field_becomes_none(self): self.assertIsNone(clean("  "))
    def test_invalid_date_is_rejected(self):
        with self.assertRaises(ValueError): parse_date("2020-02-31")
    def test_invalid_source_date_is_preserved_as_text(self):
        row = fixture_rows("deceased")[0][1]
        payload = self.importer().deceased_payload(row, MUNICIPALITY, {}, NOW)
        self.assertIsNone(payload["death_date"]); self.assertEqual(payload["death_date_text"], "neteisinga")
        self.assertTrue(payload["_warnings"])
    def test_year_only_is_not_fabricated(self):
        date, year, original = parse_date("1940"); self.assertIsNone(date); self.assertEqual(year, 1940); self.assertEqual(original, "1940")
    def test_negative_number_is_rejected(self):
        with self.assertRaises(ValueError): parse_number("-1,5")
    def test_unknown_column_is_kept_in_raw_data(self):
        row = fixture_rows("deceased")[0][0]; payload = self.importer().deceased_payload(row, MUNICIPALITY, {}, NOW)
        self.assertEqual(payload["raw_data"]["nezinomas_laukas"], "raw reikšmė")
    def test_missing_required_header_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "kapo_id"): Importer.validate_headers("deceased", fixture_rows("missing_required")[1])
    def test_repeated_upsert_does_not_duplicate(self):
        db = FakeDb(); payload = {"municipality_id": MUNICIPALITY, "source_record_id": "same", "full_name": "Jonas"}
        db.upsert("deceased_people", [payload], "municipality_id,source_record_id"); db.upsert("deceased_people", [payload], "municipality_id,source_record_id")
        self.assertEqual(len(db.tables["deceased_people"]), 1)
    def test_changed_record_is_updated(self):
        db = FakeDb(); base = {"municipality_id": MUNICIPALITY, "source_record_id": "same", "last_name": "Jonaitis"}
        db.upsert("deceased_people", [base], "municipality_id,source_record_id"); db.upsert("deceased_people", [dict(base, last_name="Jonaitienė")], "municipality_id,source_record_id")
        self.assertEqual(next(iter(db.tables["deceased_people"].values()))["last_name"], "Jonaitienė")
    def test_deceased_links_to_grave(self):
        payload = self.importer().deceased_payload(fixture_rows("deceased")[0][0], MUNICIPALITY, {"SLC-1-2-3": {"id": GRAVE, "cemetery_id": CEMETERY}}, NOW)
        self.assertEqual((payload["grave_id"], payload["cemetery_id"]), (GRAVE, CEMETERY))
    def test_deceased_without_grave_is_saved_unlinked(self):
        payload = self.importer().deceased_payload(fixture_rows("deceased")[0][0], MUNICIPALITY, {}, NOW)
        self.assertIsNone(payload["grave_id"]); self.assertEqual(payload["grave_source_id"], "SLC-1-2-3")
    def test_lithuanian_search_normalization(self): self.assertEqual(normalized("Žukauskas"), "zukauskas")
    def test_search_without_diacritics(self): self.assertIn(normalized("zukaus"), normalized("Žukauskas"))
    def test_partial_last_name_search(self): self.assertIn(normalized("jonai"), normalized("Jonaitis"))
    def test_pagination_is_present_in_rpc(self):
        sql = (ROOT.parent / "supabase" / "migrations" / "20260713194003_official_cemetery_import.sql").read_text(encoding="utf-8")
        self.assertIn("p_page integer default 1", sql); self.assertIn("offset (greatest(coalesce(p_page, 1), 1) - 1)", sql)
    def test_official_server_http_error(self):
        with self.assertRaises(RuntimeError): HttpClient(timeout=2, retries=1).json(self.base + "/error")
    def test_html_is_not_accepted_as_csv(self):
        args = SimpleNamespace(data_dir=tempfile.mkdtemp(), import_date="2026-07-13", import_only=False)
        importer = self.importer(); importer.args = args; importer.http = HttpClient(timeout=2, retries=1); importer.source_url = lambda code, kind: self.base + "/html"
        with self.assertRaisesRegex(RuntimeError, "Content-Type"): importer.download("Test", "graves")
    def test_cancelled_import_is_marked_without_rollback(self):
        source = (ROOT.parent / "import_cemetery_data.py").read_text(encoding="utf-8")
        self.assertIn('status = "cancelled" if isinstance(exc, KeyboardInterrupt)', source); self.assertIn("BATCH_SIZE = 250", source)

    def test_temporary_import_token_is_sent_only_when_configured(self):
        source = (ROOT.parent / "import_cemetery_data.py").read_text(encoding="utf-8")
        self.assertIn('self.headers["x-import-token"] = import_token', source)
        self.assertIn('if not key and self.import_token:', source)
        self.assertIn('key = os.environ.get("SUPABASE_KEY")', source)
    def test_web_mercator_is_converted_to_wgs84(self):
        latitude, longitude = point_coordinates("POINT (2711044.76 7487943)"); self.assertTrue(54 < latitude < 56); self.assertTrue(23 < longitude < 26)
    def test_decimal_comma_and_point(self): self.assertEqual(parse_number("2,5"), 2.5); self.assertEqual(parse_number("2.5"), 2.5)
    def test_public_rpc_does_not_return_raw_data(self):
        sql = (ROOT.parent / "supabase" / "migrations" / "20260713194003_official_cemetery_import.sql").read_text(encoding="utf-8")
        self.assertNotIn("raw_data", sql.split("create or replace function public.search_deceased", 1)[1])
    def test_grave_search_shows_loader_while_waiting(self):
        source = (ROOT.parent / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        styles = (ROOT.parent / "css" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("grave-loader__spinner", source); self.assertIn('aria-busy", "true', source)
        self.assertIn("@keyframes grave-loader-spin", styles)

    def test_grave_results_expand_and_link_to_google_maps(self):
        source = (ROOT.parent / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        styles = (ROOT.parent / "css" / "styles.css").read_text(encoding="utf-8")
        edge = (ROOT.parent / "supabase" / "functions" / "cemetery-search" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("<details class='grave-list-item'>", source)
        self.assertIn("Atidaryti „Google Maps“", source)
        self.assertIn("grave-list-item__details", styles)
        self.assertIn("fromWebMercator", edge)
        self.assertIn("fromLks94", edge)
        self.assertNotIn("|| valid[0]", edge)
        self.assertIn("matchAll", edge)

    def test_public_search_uses_data_gov_edge_function(self):
        frontend = (ROOT.parent / "assets" / "official-grave-search.js").read_text(encoding="utf-8")
        edge = (ROOT.parent / "supabase" / "functions" / "cemetery-search" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("/functions/v1/cemetery-search", frontend)
        self.assertNotIn('rpc("search_deceased"', frontend)
        self.assertIn("https://get.data.gov.lt/datasets/gov/kapines/registras", edge)
        self.assertNotIn("DATA_GOV_API_TOKEN", edge)
        self.assertNotIn("Authorization", edge)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", edge)

    def test_data_gov_name_search_ignores_letter_case(self):
        edge = (ROOT.parent / "supabase" / "functions" / "cemetery-search" / "index.ts").read_text(encoding="utf-8")
        self.assertIn('toLocaleLowerCase("lt-LT")', edge)
        self.assertIn('return `lower(${field}).contains(${literal(value)})`', edge)
        self.assertNotIn("return [value.toUpperCase()]", edge)

    def test_scheduled_database_import_is_disabled(self):
        self.assertFalse((ROOT.parent / ".github" / "workflows" / "cemetery-import.yml").exists())


if __name__ == "__main__": unittest.main(verbosity=2)
