from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit


PUBLIC_DIRECTORIES = {"assets", "css", "Nuotraukos"}
PUBLIC_ROOT_SUFFIXES = {".html", ".ico", ".jpg", ".jpeg", ".png", ".webp", ".mp4"}

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
        "form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https://*.supabase.co https://res.cloudinary.com; "
        "media-src 'self' blob: https://*.supabase.co "
        "https://res.cloudinary.com; connect-src 'self' https://*.supabase.co"
    ),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
}


def is_public_path(raw_path):
    path = unquote(urlsplit(raw_path).path).replace("\\", "/")
    if path in ("", "/"):
        return True

    relative = path.lstrip("/")
    candidate = PurePosixPath(relative)
    if not candidate.parts or any(part in ("", ".", "..") for part in candidate.parts):
        return False
    if len(candidate.parts) == 1:
        return candidate.suffix.lower() in PUBLIC_ROOT_SUFFIXES
    return candidate.parts[0] in PUBLIC_DIRECTORIES


class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not is_public_path(self.path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not is_public_path(self.path):
            self.send_error(404)
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 5000), NoCacheHandler)
    print("Atminimas: http://localhost:5000")
    server.serve_forever()
