import json
import os
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory

from serve import SECURITY_HEADERS, is_public_path


load_dotenv()
load_dotenv("gemini-code-1779135220512.env")

app = Flask(__name__, static_folder=None)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Trūksta SUPABASE_URL arba SUPABASE_KEY .env faile.")

LOCAL_ATMINIMAS = {
    "id": "local-demo",
    "slug": "demo",
    "vardas": "VARDAS PAVARDĖ",
    "gimimo_data": "Gimimo data",
    "mirties_data": "Mirties data",
    "epitafija": "EPITAFIJA",
    "video_url": "finals.mp4",
}

LOCAL_NUOTRAUKOS = [
    {"url": "Nuotraukos/S_pirma.jpg", "eile_nr": 1, "pixel_art": False},
    {"url": "Nuotraukos/S_antra.jpg", "eile_nr": 2, "pixel_art": True},
    {"url": "Nuotraukos/S_trecia.jpg", "eile_nr": 3, "pixel_art": False},
]


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.after_request
def add_security_headers(response):
    for name, value in SECURITY_HEADERS.items():
        response.headers[name] = value
    return response


@app.route("/<path:filename>")
def public_file(filename):
    if not is_public_path(filename):
        abort(404)
    return send_from_directory(".", filename)


@app.route("/api/atminimai")
def list_atminimai():
    try:
        rows = supabase_get("atminimai", {"select": "*", "order": "created_at.asc"})
        return jsonify({"atminimai": rows})
    except Exception as exc:
        return jsonify({"atminimai": [LOCAL_ATMINIMAS], "warning": str(exc), "source": "local"})


@app.route("/api/atminimas/<identifier>")
def get_atminimas_api(identifier):
    try:
        atminimas = find_atminimas(identifier)
        if not atminimas:
            return jsonify({"error": f"Atminimas su identifikatoriumi '{identifier}' nerastas"}), 404

        nuotraukos = []
        try:
            nuotraukos = supabase_get(
                "nuotraukos",
                {
                    "atminimas_id": "eq." + str(atminimas["id"]),
                    "select": "*",
                    "order": "eile_nr.asc",
                },
            )
        except Exception:
            pass

        return jsonify({"atminimas": atminimas, "nuotraukos": nuotraukos})
    except Exception as exc:
        return jsonify(local_payload(str(exc)))


@app.route("/api/deceased/search")
def search_deceased_api():
    try:
        page = max(int(request.args.get("page", "1")), 1)
        page_size = min(max(int(request.args.get("pageSize", "20")), 1), 100)
        birth_year = optional_year(request.args.get("birthYear"))
        death_year = optional_year(request.args.get("deathYear"))
    except ValueError:
        return jsonify({"error": "Neteisingi puslapiavimo arba metu parametrai."}), 400

    query = (request.args.get("query") or "").strip()
    first_name = (request.args.get("firstName") or "").strip()
    last_name = (request.args.get("lastName") or "").strip()
    if not any((query, first_name, last_name, birth_year, death_year,
                request.args.get("municipality"), request.args.get("cemetery"))):
        return jsonify({"error": "Nurodykite bent viena paieskos kriteriju."}), 400

    payload = {
        "p_query": query or None,
        "p_first_name": first_name or None,
        "p_last_name": last_name or None,
        "p_birth_year": birth_year,
        "p_death_year": death_year,
        "p_municipality": (request.args.get("municipality") or "").strip() or None,
        "p_cemetery": (request.args.get("cemetery") or "").strip() or None,
        "p_page": page,
        "p_page_size": page_size,
    }
    try:
        result = cemetery_search(payload)
    except Exception as exc:
        app.logger.warning("Deceased search failed: %s", exc)
        return jsonify({"error": "Paieska siuo metu nepasiekiama."}), 502
    return jsonify(result)


def optional_year(value):
    if value is None or not str(value).strip():
        return None
    year = int(value)
    if not 1000 <= year <= 2200:
        raise ValueError("year")
    return year


def find_atminimas(identifier):
    if identifier.isdigit():
        rows = supabase_get("atminimai", {"id": "eq." + identifier, "select": "*", "limit": "1"})
        if rows:
            return rows[0]

    rows = supabase_get("atminimai", {"slug": "eq." + identifier, "select": "*", "limit": "1"})
    if rows:
        return rows[0]

    return None


def supabase_get(table, params):
    query = urllib.parse.urlencode(params)
    url = f"{SUPABASE_URL}/rest/v1/{urllib.parse.quote(table)}?{query}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Accept": "application/json",
    }
    if not SUPABASE_KEY.startswith("sb_publishable_"):
        headers["Authorization"] = "Bearer " + SUPABASE_KEY

    request = urllib.request.Request(
        url,
        headers=headers,
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {exc.code}: {body}") from exc


def supabase_rpc(function_name, payload):
    url = f"{SUPABASE_URL}/rest/v1/rpc/{urllib.parse.quote(function_name)}"
    headers = {"apikey": SUPABASE_KEY, "Accept": "application/json", "Content-Type": "application/json"}
    if not SUPABASE_KEY.startswith("sb_publishable_"):
        headers["Authorization"] = "Bearer " + SUPABASE_KEY
    rpc_request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(rpc_request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {exc.code}: {body}") from exc


def cemetery_search(payload):
    """Proxy the public search through an Edge Function; no cemetery rows live in Supabase."""
    url = os.environ.get("CEMETERY_SEARCH_API_URL") or (
        f"{SUPABASE_URL}/functions/v1/cemetery-search"
    )
    headers = {
        "apikey": SUPABASE_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if not SUPABASE_KEY.startswith("sb_publishable_"):
        headers["Authorization"] = "Bearer " + SUPABASE_KEY
    api_request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(api_request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Cemetery search API {exc.code}: {body}") from exc


def local_payload(warning=None):
    payload = {
        "atminimas": LOCAL_ATMINIMAS,
        "nuotraukos": LOCAL_NUOTRAUKOS,
        "source": "local",
    }
    if warning:
        payload["warning"] = warning
    return payload


if __name__ == "__main__":
    app.run(debug=True, port=5000)
