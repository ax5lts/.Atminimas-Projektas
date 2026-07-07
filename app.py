import json
import os
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, send_from_directory

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
