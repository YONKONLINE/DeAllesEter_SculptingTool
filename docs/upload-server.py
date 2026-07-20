"""
Vorm Jr. Upload Server
======================
Run this on the PC where you want exported OBJ files to arrive.
Kids press "Export" in Vorm Jr. and files land in the OUTPUT_FOLDER.

Usage:
    python upload-server.py

Files will be saved to a folder called "exports" next to this script.
The server runs on port 8080 and accepts uploads from any device on the network.

Tell Vorm Jr. the address:  http://<THIS_PC_IP>:8080
"""

import os
import json
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# --- Config --- Change this to your target folder:
OUTPUT_FOLDER = r"C:\Users\niels\Dropbox\_YONK\2_CLIENTS\2026\09 Cinekid\03 Food Drawings"
# OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports")
PORT = 8080

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

class UploadHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        """Receive uploaded files"""
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
            name = data.get("name", "unnamed")
            files = data.get("files", [])

            # Create a subfolder with timestamp + name
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in name).strip() or "drawing"
            folder = os.path.join(OUTPUT_FOLDER, f"{timestamp}_{safe_name}")
            os.makedirs(folder, exist_ok=True)

            saved = []
            for f in files:
                filename = f.get("filename", "file.txt")
                content = f.get("content", "")
                filepath = os.path.join(folder, filename)
                with open(filepath, "w", encoding="utf-8") as fh:
                    fh.write(content)
                saved.append(filename)

            print(f"Saved {len(saved)} files to {folder}")

            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "saved": saved}).encode())

        except Exception as e:
            print(f"Error: {e}")
            self.send_response(500)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())

    def do_GET(self):
        """Health check — visit in browser to test connection"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "server": "Vorm Jr. Upload Server"}).encode())

    def log_message(self, format, *args):
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {args[0]}")

def get_all_ips():
    """Get all local IP addresses"""
    import subprocess
    ips = []
    try:
        result = subprocess.run(["ipconfig"], capture_output=True, text=True, timeout=5)
        for line in result.stdout.split("\n"):
            line = line.strip()
            if "IPv4" in line and ":" in line:
                ip = line.split(":")[-1].strip()
                if ip and not ip.startswith("127."):
                    ips.append(ip)
    except:
        pass
    if not ips:
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
            s.close()
        except:
            ips.append("127.0.0.1")
    return ips

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), UploadHandler)
    ips = get_all_ips()

    print(f"")
    print(f"  Vorm Jr. Upload Server")
    print(f"  ======================")
    print(f"  Saving to: {OUTPUT_FOLDER}")
    print(f"")
    print(f"  Your network addresses (try each if one doesn't work):")
    for ip in ips:
        print(f"    http://{ip}:{PORT}")
    print(f"")
    print(f"  TEST: Open one of these URLs in a browser on the OTHER device.")
    print(f"  If you see {'{'}\"ok\": true{'}'} it works!")
    print(f"")
    print(f"  Waiting for exports...")
    print(f"")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
