import argparse
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit


PUBLIC_DIRECTORIES = {"assets", "css"}
PUBLIC_ROOT_SUFFIXES = {".html", ".ico", ".jpg", ".jpeg", ".png", ".webp", ".mp4"}

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
        "form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https://*.supabase.co; "
        "media-src 'self' blob: https://*.supabase.co; "
        "connect-src 'self' https://*.supabase.co; "
        "frame-src https://www.openstreetmap.org"
    ),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Permitted-Cross-Domain-Policies": "none",
}


def is_public_path(raw_path):
    path = urlsplit(raw_path).path
    previous = None
    while path != previous:
        previous = path
        path = unquote(path)
    path = path.replace("\\", "/")
    if path in ("", "/"):
        return True

    relative = path.lstrip("/")
    raw_parts = relative.split("/")
    if (
        not raw_parts
        or any(part in ("", ".", "..") for part in raw_parts)
        or any(ord(char) < 32 or ord(char) == 127 for char in relative)
    ):
        return False
    candidate = PurePosixPath(relative)
    if len(candidate.parts) == 1:
        return candidate.suffix.lower() in PUBLIC_ROOT_SUFFIXES
    return candidate.parts[0] in PUBLIC_DIRECTORIES


class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not is_public_path(self.path):
            self.send_error(404)
            return
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # Naršyklė arba testas gali nutraukti didelio failo atsisiuntimą.
            pass

    def do_HEAD(self):
        if not is_public_path(self.path):
            self.send_error(404)
            return
        try:
            super().do_HEAD()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Paleisti Atminimas vietinį serverį.")
    parser.add_argument("--lan", action="store_true", help="Leisti peržiūrą kituose to paties vietinio tinklo įrenginiuose.")
    args = parser.parse_args()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = ThreadingHTTPServer((host, 5000), NoCacheHandler)
    if args.lan:
        try:
            lan_ip = socket.gethostbyname(socket.gethostname())
        except OSError:
            lan_ip = "KOMPIUTERIO-IP"
        print("Atminimas telefone: http://{0}:5000".format(lan_ip))
        print("Veikia tik kol šis langas atidarytas. Baigti: Ctrl+C")
    else:
        print("Atminimas: http://localhost:5000")
    server.serve_forever()
