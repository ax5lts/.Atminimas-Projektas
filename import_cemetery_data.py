#!/usr/bin/env python3
"""Srautinio oficialiu Lietuvos kapiniu duomenu importo komanda."""

from __future__ import print_function

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


DEFAULT_BASE_URL = "https://get.data.gov.lt/datasets/gov/kapines/registras"
KINDS = {"graves": "kapavietes", "deceased": "velioniai"}
BATCH_SIZE = 250
REQUIRED_HEADERS = {
    "graves": (("_id", "vda_id"), ("kapo_id",), ("kapines",)),
    "deceased": (("_id", "vda_id"), ("kapo_id",), ("vardas", "pavarde")),
}
ALIASES = {
    "source_id": ("_id", "id", "iraso_id", "source_record_id", "vda_id"),
    "source_updated": ("_revision", "revision", "atnaujinta"),
    "municipality": ("savivaldybe", "savivaldybė", "municipality"),
    "cemetery": ("kapines", "kapinės", "kapiniu_pavadinimas", "cemetery"),
    "grave_id": ("kapo_id", "kapavietes_id", "kapavietės_id", "grave_id"),
    "grave_type": ("tipas", "kapo_tipas", "grave_type"),
    "section": ("sektorius", "kvartalas", "section"),
    "row": ("eile", "eilė", "row"),
    "place": ("kapaviete", "kapavietė", "vietos_numeris", "place_number"),
    "first_name": ("vardas", "first_name"),
    "last_name": ("pavarde", "pavardė", "last_name"),
    "gender": ("lytis", "gender"),
    "birth_date": ("gimimo_data", "birth_date"),
    "death_date": ("mirties_data", "death_date"),
    "burial_date": ("laidojimo_data", "palaidojimo_data", "burial_date"),
    "geometry": ("geometrija", "geometry"),
}


def load_env_file(path):
    path = Path(path)
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
            os.environ.setdefault(name, value)


def clean(value):
    if value is None:
        return None
    value = re.sub(r"\s+", " ", str(value).strip())
    return value or None


def normalized(value):
    value = clean(value)
    if not value:
        return None
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()


def get_value(row, alias):
    for name in ALIASES.get(alias, (alias,)):
        value = clean(row.get(name))
        if value is not None:
            return value
    return None


def parse_bool(value):
    value = normalized(value)
    if value is None:
        return None
    if value in ("true", "1", "taip", "yes"):
        return True
    if value in ("false", "0", "ne", "no"):
        return False
    raise ValueError("Neteisinga boolean reiksme: {0}".format(value))


def parse_number(value, integer=False, nonnegative=True):
    value = clean(value)
    if value is None:
        return None
    compact = value.replace(" ", "")
    if "," in compact and "." in compact:
        if compact.rfind(",") > compact.rfind("."):
            compact = compact.replace(".", "").replace(",", ".")
        else:
            compact = compact.replace(",", "")
    else:
        compact = compact.replace(",", ".")
    number = int(float(compact)) if integer else float(compact)
    if nonnegative and number < 0:
        raise ValueError("Neigiama skaicine reiksme: {0}".format(value))
    return number


def parse_date(value):
    value = clean(value)
    if value is None:
        return None, None, None
    if re.match(r"^\d{4}$", value):
        year = int(value)
        if not 1000 <= year <= 2200:
            raise ValueError("Neleistini metai: {0}".format(value))
        return None, year, value
    candidates = ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%d.%m.%Y", "%d/%m/%Y")
    for pattern in candidates:
        try:
            parsed = dt.datetime.strptime(value, pattern).date()
            if not 1000 <= parsed.year <= 2200:
                raise ValueError("Neleistina data: {0}".format(value))
            return parsed.isoformat(), parsed.year, value
        except ValueError:
            continue
    raise ValueError("Neteisinga data: {0}".format(value))


def point_coordinates(geometry):
    geometry = clean(geometry)
    if not geometry:
        return None, None
    match = re.search(r"POINT\s*(?:Z\s*)?\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)", geometry, re.I)
    if not match:
        return None, None
    x, y = float(match.group(1)), float(match.group(2))
    if -180 <= x <= 180 and -90 <= y <= 90:
        return round(y, 6), round(x, 6)
    if abs(x) <= 20037508.34 and abs(y) <= 20037508.34:
        longitude = x / 20037508.34 * 180.0
        latitude = math.degrees(2.0 * math.atan(math.exp(math.radians(y / 20037508.34 * 180.0))) - math.pi / 2.0)
        if -180 <= longitude <= 180 and -90 <= latitude <= 90:
            return round(latitude, 6), round(longitude, 6)
    raise ValueError("Koordinates nepatenka i leistinas ribas")


class HttpClient(object):
    def __init__(self, timeout=60, retries=4):
        self.timeout = timeout
        self.retries = retries

    def open(self, request):
        last = None
        for attempt in range(self.retries):
            try:
                return urllib.request.urlopen(request, timeout=self.timeout)
            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
                last = exc
                retryable = not isinstance(exc, urllib.error.HTTPError) or exc.code in (408, 429, 500, 502, 503, 504)
                if not retryable or attempt + 1 == self.retries:
                    break
                time.sleep(min(2 ** attempt, 16))
        raise RuntimeError("HTTP uzklausa nepavyko po {0} bandymu: {1}".format(self.retries, last))

    def json(self, url, headers=None, method="GET", payload=None):
        request_headers = {"Accept": "application/json", "User-Agent": "Atminimas-cemetery-import/1.0"}
        request_headers.update(headers or {})
        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        with self.open(request) as response:
            raw = response.read()
        return json.loads(raw.decode("utf-8")) if raw else None


class SupabaseRest(object):
    def __init__(self, url, key, http, import_token=None):
        self.base = url.rstrip("/") + "/rest/v1"
        self.http = http
        self.headers = {"apikey": key, "Authorization": "Bearer " + key}
        if import_token:
            self.headers["x-import-token"] = import_token

    def request(self, path, method="GET", payload=None, prefer=None):
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        return self.http.json(self.base + "/" + path, headers, method, payload)

    def upsert(self, table, rows, conflict):
        if not rows:
            return []
        query = urllib.parse.urlencode({"on_conflict": conflict})
        return self.request(table + "?" + query, "POST", rows, "resolution=merge-duplicates,return=representation")

    def existing_ids(self, table, municipality_id, source_ids, source_column="source_record_id"):
        if not source_ids:
            return set()
        values = ",".join('"' + str(value).replace('"', '') + '"' for value in source_ids)
        params = {
            "select": source_column,
            "municipality_id": "eq." + municipality_id,
            source_column: "in.(" + values + ")",
        }
        rows = self.request(table + "?" + urllib.parse.urlencode(params, safe="(),\"") ) or []
        return {row[source_column] for row in rows}


class Importer(object):
    def __init__(self, args):
        self.args = args
        load_env_file(args.env_file)
        self.http = HttpClient(args.timeout, args.retries)
        self.db = None
        self.import_token = os.environ.get("SUPABASE_IMPORT_TOKEN")
        self.lock_token = str(uuid.uuid4())
        self.base_url = args.base_url.rstrip("/")
        if not args.dry_run and not args.download_only:
            url = os.environ.get("SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            if not key and self.import_token:
                key = os.environ.get("SUPABASE_KEY")
            if not url or not key:
                raise RuntimeError("Importui reikia SUPABASE_URL ir SUPABASE_SERVICE_ROLE_KEY; laikinas administravimo importas taip pat gali naudoti SUPABASE_IMPORT_TOKEN su SUPABASE_KEY")
            self.db = SupabaseRest(url, key, self.http, self.import_token)

    def discover(self):
        found = {}
        for kind, namespace in KINDS.items():
            url = self.base_url + "/" + namespace + "/:format/json"
            payload = self.http.json(url)
            prefix = "datasets/gov/kapines/registras/{0}/".format(namespace)
            for item in (payload or {}).get("_data", []):
                name = clean(item.get("name")) or ""
                if not name.startswith(prefix):
                    continue
                code = name[len(prefix):]
                if re.match(r"^[A-Za-z0-9]+$", code):
                    entry = found.setdefault(code, {"title": clean(item.get("title")), "types": set()})
                    entry["types"].add(kind)
        if not found:
            raise RuntimeError("Oficialus API negrazino nei vieno savivaldybes modelio")
        return found

    def selected(self, models):
        if self.args.all:
            return sorted(models)
        if self.args.municipality not in models:
            raise RuntimeError("Savivaldybes modelis nerastas oficialiame API: {0}".format(self.args.municipality))
        return [self.args.municipality]

    def file_path(self, code, kind):
        namespace = KINDS[kind]
        day = self.args.import_date or dt.date.today().isoformat()
        return Path(self.args.data_dir) / day / namespace / (code + ".csv")

    def source_url(self, code, kind):
        return "{0}/{1}/{2}/:format/csv".format(self.base_url, KINDS[kind], code)

    def download(self, code, kind):
        target = self.file_path(code, kind)
        target.parent.mkdir(parents=True, exist_ok=True)
        if self.args.import_only:
            if not target.exists():
                raise RuntimeError("--import-only failas nerastas: {0}".format(target))
            return target, self.checksum(target)
        partial = target.with_suffix(".csv.part")
        request = urllib.request.Request(self.source_url(code, kind), headers={"Accept": "text/csv", "User-Agent": "Atminimas-cemetery-import/1.0"})
        digest = hashlib.sha256()
        size = 0
        with self.http.open(request) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            if "csv" not in content_type and "text/plain" not in content_type and "octet-stream" not in content_type:
                raise RuntimeError("Netinkamas Content-Type: {0}".format(content_type))
            with partial.open("wb") as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    if size == 0 and re.match(br"\s*<(?:!doctype\s+html|html|head|body)\b", chunk[:1024], re.I):
                        raise RuntimeError("Vietoje CSV gautas HTML puslapis")
                    output.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
        if size == 0:
            if partial.exists():
                partial.unlink()
            raise RuntimeError("Gautas tuscias CSV failas")
        partial.replace(target)
        return target, digest.hexdigest()

    @staticmethod
    def checksum(path):
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def reader(path):
        stream = path.open("r", encoding="utf-8-sig", newline="")
        header_line = stream.readline()
        stream.seek(0)
        # Dialekta nustatome tik is antrastes. Ilgi HTML aprasymai velesnese
        # eilutese turi daug kabuciu ir gali suklaidinti csv.Sniffer.
        delimiter = max((",", ";", "\t", "|"), key=header_line.count)
        if header_line.count(delimiter) == 0:
            stream.close()
            raise RuntimeError("Nepavyko atpazinti CSV skirtuko")
        reader = csv.DictReader(stream, delimiter=delimiter, quotechar='"', doublequote=True, strict=True)
        headers = [clean(name) for name in (reader.fieldnames or [])]
        if not headers:
            stream.close()
            raise RuntimeError("CSV neturi antrasciu")
        reader.fieldnames = headers
        return stream, reader, set(headers)

    @staticmethod
    def validate_headers(kind, headers):
        missing = ["/".join(group) for group in REQUIRED_HEADERS[kind] if not any(name in headers for name in group)]
        if missing:
            raise RuntimeError("Truksta privalomu CSV antrasciu: " + ", ".join(missing))

    def begin_run(self, kind, code, checksum):
        payload = [{
            "import_type": kind, "municipality_code": code, "source_url": self.source_url(code, kind),
            "checksum_sha256": checksum, "status": "running", "metadata": {"file": str(self.file_path(code, kind))},
        }]
        return self.db.request("import_runs", "POST", payload, "return=representation")[0]["id"]

    def finish_run(self, run_id, status, stats, error=None, metadata=None):
        payload = dict(stats)
        payload.update({"status": status, "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(), "error_message": error})
        if metadata is not None:
            payload["metadata"] = metadata
        self.db.request("import_runs?id=eq." + urllib.parse.quote(run_id), "PATCH", payload, "return=minimal")

    def unchanged(self, code, kind, checksum):
        if self.args.force:
            return False
        params = {"select": "id", "municipality_code": "eq." + code, "import_type": "eq." + kind,
                  "checksum_sha256": "eq." + checksum, "status": "eq.completed", "limit": "1"}
        return bool(self.db.request("import_runs?" + urllib.parse.urlencode(params)))

    def municipality(self, code, title, fallback_name):
        name = clean(fallback_name) or clean(title) or code
        rows = self.db.upsert("municipalities", [{"source_code": code, "name": name, "normalized_name": normalized(name),
                                                   "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}], "source_code")
        return rows[0]

    def log_errors(self, run_id, code, errors):
        if not errors:
            return
        for item in errors:
            item.update({"import_run_id": run_id, "municipality_code": code})
        self.db.request("import_errors", "POST", errors, "return=minimal")

    def cemetery_ids(self, municipality_id, names):
        unique = {name: normalized(name) for name in names if clean(name)}
        payload = [{"municipality_id": municipality_id, "source_name": name, "name": name,
                    "normalized_name": norm, "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
                   for name, norm in unique.items()]
        rows = self.db.upsert("cemeteries", payload, "municipality_id,normalized_name")
        return {row["normalized_name"]: row["id"] for row in rows}

    def grave_payload(self, row, municipality_id, cemetery_id, now):
        source_id = get_value(row, "source_id")
        grave_source_id = get_value(row, "grave_id")
        if not source_id or not grave_source_id:
            raise ValueError("Truksta oficialaus iraso arba kapo ID")
        geometry = get_value(row, "geometry")
        latitude, longitude = point_coordinates(geometry)
        length = parse_number(row.get("ilgis_m"))
        width = parse_number(row.get("plotis_m"))
        area = parse_number(row.get("kapavietes_dydis"))
        if area is None and length is not None and width is not None:
            area = round(length * width, 4)
        return {
            "source_record_id": source_id, "municipality_id": municipality_id, "cemetery_id": cemetery_id,
            "grave_source_id": grave_source_id, "grave_type": get_value(row, "grave_type"),
            "section": get_value(row, "section"), "row": get_value(row, "row"), "place_number": get_value(row, "place"),
            "length_m": length, "width_m": width, "area_m2": area,
            "buried_count": parse_number(row.get("palaidotu_sk"), integer=True),
            "maximum_burials": parse_number(row.get("maks_velioniu_sk"), integer=True),
            "latitude": latitude, "longitude": longitude, "geometry": geometry,
            "cultural_heritage": parse_bool(row.get("ar_kulturos_paveldas")),
            "heritage_code": clean(row.get("paveldo_kodas")), "heritage_description": clean(row.get("paveldo_aprasymas_lt")),
            "nonstandard_size": parse_bool(row.get("ar_nestandartinis_dydis")), "raw_data": row,
            "is_active": True, "last_seen_at": now, "missing_since": None, "updated_at": now,
        }

    def deceased_payload(self, row, municipality_id, grave_map, now):
        source_id = get_value(row, "source_id")
        grave_source_id = get_value(row, "grave_id")
        first = get_value(row, "first_name")
        last = get_value(row, "last_name")
        if not source_id or not grave_source_id or not (first or last):
            raise ValueError("Truksta oficialaus iraso ID, kapo ID arba vardo/pavardes")
        warnings = []
        def safe_date(field, label):
            original = get_value(row, field)
            try:
                return parse_date(original)
            except ValueError as exc:
                warnings.append(label + ": " + str(exc))
                return None, None, original
        birth_date, birth_year, birth_text = safe_date("birth_date", "gimimo_data")
        death_date, death_year, death_text = safe_date("death_date", "mirties_data")
        burial_date, burial_year, burial_text = safe_date("burial_date", "laidojimo_data")
        if birth_date and death_date and death_date < birth_date:
            warnings.append("Mirties data ankstesne uz gimimo data")
            death_date = None
        if death_date and burial_date and burial_date < death_date:
            warnings.append("Laidojimo data ankstesne uz mirties data")
            burial_date = None
        link = grave_map.get(grave_source_id) or {}
        full_name = clean(" ".join(part for part in (first, last) if part))
        return {
            "source_record_id": source_id, "municipality_id": municipality_id,
            "cemetery_id": link.get("cemetery_id"), "grave_id": link.get("id"), "grave_source_id": grave_source_id,
            "grave_section": get_value(row, "section"), "grave_row": get_value(row, "row"),
            "grave_place_number": get_value(row, "place"),
            "first_name": first, "last_name": last, "full_name": full_name,
            "normalized_first_name": normalized(first), "normalized_last_name": normalized(last),
            "normalized_full_name": normalized(full_name), "gender": get_value(row, "gender"),
            "birth_date": birth_date, "death_date": death_date, "burial_date": burial_date,
            "birth_year": birth_year, "death_year": death_year, "burial_year": burial_year,
            "birth_date_text": birth_text, "death_date_text": death_text, "burial_date_text": burial_text,
            "grave_depth": parse_number(row.get("kapo_gylis_m")),
            "relationship_information": clean(row.get("rysys_su_palaidotu")),
            "additional_information": clean(row.get("aprasymas_lt")), "raw_data": row,
            "is_active": True, "last_seen_at": now, "missing_since": None, "updated_at": now,
            "_warnings": warnings,
        }

    def grave_links(self, municipality_id, grave_ids):
        if not grave_ids:
            return {}
        values = ",".join('"' + value.replace('"', '') + '"' for value in grave_ids)
        params = {"select": "id,cemetery_id,grave_source_id", "municipality_id": "eq." + municipality_id,
                  "grave_source_id": "in.(" + values + ")"}
        rows = self.db.request("graves?" + urllib.parse.urlencode(params, safe="(),\"")) or []
        return {row["grave_source_id"]: row for row in rows}

    def import_file(self, code, kind, path, checksum, title):
        if self.unchanged(code, kind, checksum):
            print("SKIP {0} {1}: checksum nepasikeite".format(code, kind))
            return
        stream, reader, headers = self.reader(path)
        self.validate_headers(kind, headers)
        stats = {"downloaded_rows": 0, "inserted_rows": 0, "updated_rows": 0, "skipped_rows": 0, "invalid_rows": 0}
        run_id = self.begin_run(kind, code, checksum)
        municipality = None
        try:
            batch = []
            for row_number, row in enumerate(reader, 2):
                if self.args.limit and stats["downloaded_rows"] >= self.args.limit:
                    break
                row = {clean(key): clean(value) for key, value in row.items() if key is not None}
                stats["downloaded_rows"] += 1
                batch.append((row_number, row))
                if len(batch) >= BATCH_SIZE:
                    municipality = self.import_batch(code, kind, batch, municipality, title, run_id, stats)
                    batch = []
            if batch:
                municipality = self.import_batch(code, kind, batch, municipality, title, run_id, stats)
            if kind == "deceased" and municipality and not self.import_token:
                self.db.request("rpc/relink_deceased_people", "POST", {"p_municipality_id": municipality["id"]})
            self.finish_run(run_id, "completed", stats, metadata={"file": str(path), "headers": sorted(headers)})
            print("OK {0} {1}: {2}".format(code, kind, json.dumps(stats, ensure_ascii=False)))
        except (Exception, KeyboardInterrupt) as exc:
            status = "cancelled" if isinstance(exc, KeyboardInterrupt) else "failed"
            self.finish_run(run_id, status, stats, str(exc), {"file": str(path), "headers": sorted(headers)})
            raise
        finally:
            stream.close()

    def import_batch(self, code, kind, batch, municipality, title, run_id, stats):
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        if municipality is None:
            municipality = self.municipality(code, title, next((get_value(row, "municipality") for _, row in batch if get_value(row, "municipality")), None))
        errors = []
        output = []
        if kind == "graves":
            cemetery_map = self.cemetery_ids(municipality["id"], [get_value(row, "cemetery") for _, row in batch])
            for row_number, row in batch:
                try:
                    cemetery_id = cemetery_map.get(normalized(get_value(row, "cemetery")))
                    if not cemetery_id:
                        raise ValueError("Truksta kapiniu pavadinimo")
                    output.append(self.grave_payload(row, municipality["id"], cemetery_id, now))
                except Exception as exc:
                    stats["invalid_rows"] += 1
                    errors.append({"source_url": self.source_url(code, kind), "row_number": row_number,
                                   "source_record_id": get_value(row, "source_id"), "error_type": "validation",
                                   "error_message": str(exc), "raw_row": row})
            table = "graves"
        else:
            links = self.grave_links(municipality["id"], [get_value(row, "grave_id") for _, row in batch if get_value(row, "grave_id")])
            for row_number, row in batch:
                try:
                    payload = self.deceased_payload(row, municipality["id"], links, now)
                    for warning in payload.pop("_warnings", []):
                        errors.append({"source_url": self.source_url(code, kind), "row_number": row_number,
                                       "source_record_id": payload["source_record_id"], "error_type": "date_warning",
                                       "error_message": warning, "raw_row": row})
                    if payload["grave_id"] is None:
                        errors.append({"source_url": self.source_url(code, kind), "row_number": row_number,
                                       "source_record_id": payload["source_record_id"], "error_type": "unlinked_grave",
                                       "error_message": "Kapaviete pagal kapo_id nerasta; velionis issaugotas", "raw_row": row})
                    output.append(payload)
                except Exception as exc:
                    stats["invalid_rows"] += 1
                    errors.append({"source_url": self.source_url(code, kind), "row_number": row_number,
                                   "source_record_id": get_value(row, "source_id"), "error_type": "validation",
                                   "error_message": str(exc), "raw_row": row})
            table = "deceased_people"
        existing = self.db.existing_ids(table, municipality["id"], [row["source_record_id"] for row in output])
        self.db.upsert(table, output, "municipality_id,source_record_id")
        stats["updated_rows"] += len(existing)
        stats["inserted_rows"] += len(output) - len(existing)
        self.log_errors(run_id, code, errors)
        if not self.import_token:
            self.db.request("rpc/heartbeat_cemetery_import", "POST", {"p_owner_token": self.lock_token, "p_ttl_seconds": 900})
        return municipality

    def dry_run(self, code, kind, path):
        stream, reader, headers = self.reader(path)
        self.validate_headers(kind, headers)
        valid = invalid = warnings = total = 0
        try:
            for row in reader:
                if self.args.limit and total >= self.args.limit:
                    break
                total += 1
                row = {clean(key): clean(value) for key, value in row.items() if key is not None}
                try:
                    if kind == "graves":
                        self.grave_payload(row, "00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000", dt.datetime.now(dt.timezone.utc).isoformat())
                    else:
                        payload = self.deceased_payload(row, "00000000-0000-0000-0000-000000000000", {}, dt.datetime.now(dt.timezone.utc).isoformat())
                        for warning in payload.pop("_warnings", []):
                            warnings += 1
                            print("DRY-RUN perspėjimas {0} {1} eilute {2}: {3}".format(code, kind, total + 1, warning), file=sys.stderr)
                    valid += 1
                except Exception as exc:
                    invalid += 1
                    print("DRY-RUN klaida {0} {1} eilute {2}: {3}".format(code, kind, total + 1, exc), file=sys.stderr)
            print("DRY-RUN {0} {1}: total={2}, valid={3}, invalid={4}, warnings={5}, headers={6}".format(code, kind, total, valid, invalid, warnings, ",".join(sorted(headers))))
        finally:
            stream.close()

    def run(self):
        models = self.discover()
        codes = self.selected(models)
        kinds = self.args.types or ["graves", "deceased"]
        if self.db and not self.import_token:
            claimed = self.db.request("rpc/claim_cemetery_import", "POST", {"p_owner_token": self.lock_token, "p_ttl_seconds": 900})
            if not claimed:
                raise RuntimeError("Kitas oficialiu kapiniu duomenu importas jau vyksta")
        try:
            for code in codes:
                for kind in kinds:
                    if kind not in models[code]["types"]:
                        print("SKIP {0} {1}: tipo nera oficialiame modeliu sarase".format(code, kind))
                        continue
                    path, checksum = self.download(code, kind)
                    print("FILE {0} sha256={1}".format(path, checksum))
                    if self.args.download_only:
                        continue
                    if self.args.dry_run:
                        self.dry_run(code, kind, path)
                    else:
                        self.import_file(code, kind, path, checksum, models[code].get("title"))
        finally:
            if self.db and not self.import_token:
                try:
                    self.db.request("rpc/release_cemetery_import", "POST", {"p_owner_token": self.lock_token})
                except Exception as exc:
                    print("Nepavyko atlaisvinti importo uzrakto: {0}".format(exc), file=sys.stderr)


def parser():
    result = argparse.ArgumentParser(description="Importuoti oficialius Lietuvos kapiniu registro CSV duomenis")
    scope = result.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true", help="Importuoti visus API aptiktus modelius")
    scope.add_argument("--municipality", help="Vienas oficialus modelis, pvz. PanevezioMiestas")
    result.add_argument("--type", dest="types", action="append", choices=sorted(KINDS), help="Duomenu tipas; galima kartoti")
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--download-only", action="store_true")
    mode.add_argument("--import-only", action="store_true")
    result.add_argument("--dry-run", action="store_true", help="Validuoti, bet nerasyti i DB")
    result.add_argument("--force", action="store_true", help="Importuoti ir nepasikeitusi checksum")
    result.add_argument("--limit", type=int, help="Daugiausia eiluciu kiekvienam failui")
    result.add_argument("--data-dir", default=os.environ.get("CEMETERY_IMPORT_DIR", "data-imports"))
    result.add_argument("--env-file", default=os.environ.get("CEMETERY_ENV_FILE", ".env"), help="Necommitinamas importo paslapciu failas")
    result.add_argument("--import-date", help="Naudoti YYYY-MM-DD katalogo data")
    result.add_argument("--base-url", default=os.environ.get("CEMETERY_DATA_BASE_URL", DEFAULT_BASE_URL))
    result.add_argument("--timeout", type=int, default=int(os.environ.get("CEMETERY_HTTP_TIMEOUT", "60")))
    result.add_argument("--retries", type=int, default=int(os.environ.get("CEMETERY_HTTP_RETRIES", "4")))
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    if args.limit is not None and args.limit <= 0:
        raise SystemExit("--limit turi buti teigiamas")
    try:
        Importer(args).run()
    except KeyboardInterrupt:
        print("Importas atsauktas; jau uzbaigti paketai liko saugus.", file=sys.stderr)
        return 130
    except Exception as exc:
        print("IMPORTO KLAIDA: {0}".format(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
