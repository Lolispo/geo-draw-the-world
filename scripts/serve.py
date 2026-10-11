#!/usr/bin/env python3
"""Static server for local review.

Two things the stdlib default gets wrong for this job:

  * it caches — a reviewer's open tab happily reuses last round's JS, so a fix that
    is committed, pushed and verified still looks broken to the person looking at it;
  * port 8080 is taken by another app on this machine, and a wrong-app 200 is
    indistinguishable from a right one.

Usage: python3 scripts/serve.py [port]   (default 8129)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8129
    print(f'serving on http://localhost:{port} (no-store)')
    ThreadingHTTPServer(('', port), NoCache).serve_forever()
