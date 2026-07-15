import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory

from serve import SECURITY_HEADERS, is_public_path


load_dotenv()
if not os.environ.get("SUPABASE_URL"):
    legacy_env = next(Path(".").glob("gemini-code*.env"), None)
    if legacy_env:
        load_dotenv(str(legacy_env))

app = Flask(__name__, static_folder=None)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Trūksta SUPABASE_URL arba SUPABASE_KEY .env faile.")


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


@app.route("/api/deceased/search")
def search_deceased_api():
    try:
        page = max(int(request.args.get("page", "1")), 1)
        page_size = min(max(int(request.args.get("pageSize", "20")), 1), 100)
        birth_year = optional_year(request.args.get("birthYear"))
        death_year = optional_year(request.args.get("deathYear"))
    except ValueError:
        return jsonify({"error": "Neteisingi puslapiavimo arba metų parametrai."}), 400

    query = (request.args.get("query") or "").strip()
    first_name = (request.args.get("firstName") or "").strip()
    last_name = (request.args.get("lastName") or "").strip()
    municipality = (request.args.get("municipality") or "").strip()
    cemetery = (request.args.get("cemetery") or "").strip()
    if not any((query, first_name, last_name, birth_year, death_year, municipality, cemetery)):
        return jsonify({"error": "Nurodykite bent vieną paieškos kriterijų."}), 400

    payload = {
        "p_query": query or None,
        "p_first_name": first_name or None,
        "p_last_name": last_name or None,
        "p_birth_year": birth_year,
        "p_death_year": death_year,
        "p_municipality": municipality or None,
        "p_cemetery": cemetery or None,
        "p_page": page,
        "p_page_size": page_size,
    }
    try:
        result = cemetery_search(payload)
    except Exception as exc:
        app.logger.warning("Deceased search failed: %s", exc)
        return jsonify({"error": "Paieška šiuo metu nepasiekiama."}), 502
    return jsonify(result)


def optional_year(value):
    if value is None or not str(value).strip():
        return None
    year = int(value)
    if not 1000 <= year <= 2200:
        raise ValueError("year")
    return year


def cemetery_search(payload):
    """Persiunčia viešą paiešką į Edge Function; kapinių įrašai Supabase nelaikomi."""
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
