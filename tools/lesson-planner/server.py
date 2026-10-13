#!/usr/bin/env python3
"""Loopback-only local app. Templates stay in browser-specific memory sessions."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json
import secrets
import threading
import time
import webbrowser
from urllib.parse import urlparse

from workbook import InputError, MAX_UPLOAD, Template, export_workbook, parse_children

STATIC = Path(__file__).resolve().parent / "static"
SESSIONS = {}
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Never log student names or uploaded data.

    def respond(self, status, data, kind="application/json; charset=utf-8"):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)

    def trusted_host(self):
        port = self.server.server_port
        return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

    def do_GET(self):
        if not self.trusted_host():
            return self.respond(403, {"error": "Chỉ truy cập trên máy này."})
        path = urlparse(self.path).path
        if path == "/api/session":
            token = secrets.token_urlsafe(32)
            with LOCK:
                # Idle sessions expire in memory. Reloading never restores a draft.
                for key, session in list(SESSIONS.items()):
                    if time.monotonic() - session["used"] > 12 * 3600:
                        del SESSIONS[key]
                if len(SESSIONS) >= 20:
                    return self.respond(503, {"error": "Hãy đóng các cửa sổ ứng dụng cũ và khởi động lại."})
                SESSIONS[token] = {"template": None, "used": time.monotonic()}
            return self.respond(200, {"token": token})
        files = {"/": ("index.html", "text/html; charset=utf-8"),
                 "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                 "/style.css": ("style.css", "text/css; charset=utf-8"),
                 "/vendor/ag-grid-community.min.js": ("vendor/ag-grid-community.min.js", "text/javascript"),
                 "/vendor/LICENSE.txt": ("vendor/LICENSE.txt", "text/plain")}
        if path not in files:
            return self.respond(404, {"error": "Không tìm thấy."})
        filename, kind = files[path]
        self.respond(200, (STATIC / filename).read_bytes(), kind)

    def do_POST(self):
        origin = self.headers.get("Origin")
        if not self.trusted_host() or origin not in (None, f"http://{self.headers.get('Host')}"):
            return self.respond(403, {"error": "Yêu cầu không hợp lệ."})
        token = self.headers.get("X-App-Token")
        with LOCK:
            session = SESSIONS.get(token)
            if session:
                session["used"] = time.monotonic()
        if session is None:
            return self.respond(403, {"error": "Phiên đã hết hạn. Hãy tải lại trang."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_UPLOAD:
                raise InputError("Yêu cầu trống hoặc vượt giới hạn 30 MB.")
            body = self.rfile.read(length)
            path = urlparse(self.path).path
            if path == "/api/template":
                template = Template(body)
                session["template"] = template
                self.respond(200, template.public())
            elif path == "/api/export":
                template = session["template"]
                if template is None:
                    raise InputError("Hãy chọn mẫu trước khi xuất.")
                children = parse_children(json.loads(body), template)
                result = export_workbook(template, children)
                self.respond(200, result, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            else:
                self.respond(404, {"error": "Không tìm thấy."})
        except (InputError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            self.respond(400, {"error": str(exc)})
        except Exception:
            self.respond(500, {"error": "Không thể xử lý workbook. Mẫu gốc chưa bị thay đổi."})


def main():
    parser = argparse.ArgumentParser(description="Kế hoạch cá nhân, chạy trên máy này")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as exc:
        parser.exit(1, f"Không mở được cổng {args.port}: {exc}. Thử --port 8766.\n")
    url = f"http://127.0.0.1:{server.server_port}"
    print(f"Local: {url}", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        SESSIONS.clear()


if __name__ == "__main__":
    main()
