#!/usr/bin/env python3
"""Servidor local de desarrollo para BALSASUD sin caché."""
from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    print(f'Sirviendo BALSASUD en http://{host}:{port}/ (sin caché)')
    HTTPServer((host, port), NoCacheHandler).serve_forever()
