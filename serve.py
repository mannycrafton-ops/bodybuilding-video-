#!/usr/bin/env python3
"""Tiny local web server for VlogCut.

Opening index.html directly with file:// blocks the video engine in most
browsers, so serve it over http instead. Run:

    python3 serve.py

then open the printed URL (default http://localhost:8000).
"""
import http.server
import socketserver
import webbrowser

PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Help caching behave and keep the editor responsive during dev.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"VlogCut running at {url}  (press Ctrl+C to stop)")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()
