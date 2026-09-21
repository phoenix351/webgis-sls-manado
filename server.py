import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    handler = CORSRequestHandler
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("==================================================")
        print("  WebGIS Peta SLS & Titik Geotag Kota Manado")
        print(f"  Server berjalan pada: {url}")
        print("  Tekan Ctrl+C untuk menghentikan server.")
        print("==================================================")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer dihentikan.")

if __name__ == "__main__":
    main()
