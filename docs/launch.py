"""
De Alleseter — one-click launcher.

Double-click Start.bat next to this file. It will:

    1. Ask you (only the first time on this laptop) where to save exported
       drawings, and remember the choice in launcher-config.txt.
    2. Serve the app from this folder on port 8000.
    3. Run the upload receiver on port 8080, writing incoming exports
       into the folder you picked.

The iPad-side app auto-detects the upload URL from its own page address
(http://<laptop-ip>:8080 whenever the app was opened at
http://<laptop-ip>:8000), so there is nothing to configure per device.

On any iPad on the SAME Wi-Fi, open:
    http://<laptop-ip>:8000
and one of the addresses printed below will work.

To change the export folder later: edit launcher-config.txt or just
delete it and re-launch to be prompted again.

Command line:
    python launch.py --folder "D:\\path\\to\\exports"

First-time firewall setup on Windows: run allow-firewall.bat once (right
click → Run as administrator).
"""

import datetime
import http.server
import json
import os
import socket
import socketserver
import sys
import threading
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import filedialog
    HAS_TK = True
except Exception:
    HAS_TK = False

APP_PORT = 8000
UPLOAD_PORT = 8080
# Sent in the health-check response so a new launch can recognise an older copy
# of itself on the port (and only ever shut down its own kind).
SERVER_ID = "De Alleseter Upload"
SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "launcher-config.txt"


# ---------- Config file (key=value on each line) ----------

def read_config():
    if not CONFIG_PATH.exists():
        return {}
    out = {}
    for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def write_config(d):
    body = "\n".join(f"{k}={v}" for k, v in d.items())
    CONFIG_PATH.write_text(body + "\n", encoding="utf-8")


# ---------- Export folder resolution ----------

def prompt_folder(default=None):
    if HAS_TK:
        root = tk.Tk()
        root.withdraw()
        try:
            folder = filedialog.askdirectory(
                title="Where should exported drawings be saved?",
                initialdir=default or str(Path.home()),
                mustexist=True,
            )
        finally:
            root.destroy()
        return folder or None
    print()
    print("Enter the full path of the folder where exports should go.")
    print("(You can also edit launcher-config.txt later.)")
    return input("Folder: ").strip() or None


def get_export_folder(cli_arg=None):
    """Ask on every launch, pre-loading the last folder so it's still one-click.

    Order:
      1. --folder on the CLI wins (unattended).
      2. Otherwise open the picker with the last-used folder as the starting
         location. Enter/OK → whatever the user selected. Cancel → keep last.
      3. First run with no last folder + Cancel → fall back to ./exports.
    """
    if cli_arg:
        return cli_arg
    cfg = read_config()
    last = cfg.get("export_folder")
    initial = last if last and Path(last).exists() else str(Path.home())

    if last:
        print(f"Last used folder: {last}")
        print("Pick again (or Cancel to keep it)...")
    else:
        print("Pick the folder for exports...")

    folder = prompt_folder(default=initial)
    if not folder:
        if last:
            folder = last
            print(f"Keeping previous folder: {folder}")
        else:
            folder = str(SCRIPT_DIR / "exports")
            print(f"No folder chosen — falling back to {folder}")

    cfg["export_folder"] = folder
    write_config(cfg)
    return folder


# ---------- Local IPs (for printing the connect URL) ----------

def get_local_ips():
    """Returns (best, others).

    'best' is the address on the interface that actually reaches the network, so
    it's the one the iPads can see. The rest are usually VPN or virtual adapters
    (Hyper-V, Dropbox, VirtualBox) that look plausible but go nowhere — they're
    listed as fallbacks rather than presented as equal choices.
    """
    best = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # No packets are sent; this just picks a route.
        best = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    others = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip != best:
                others.add(ip)
    except Exception:
        pass

    if not best:
        ordered = sorted(others)
        return (ordered[0] if ordered else "127.0.0.1"), ordered[1:]
    return best, sorted(others)


# ---------- Upload receiver (port 8080) ----------

class UploadHandler(http.server.BaseHTTPRequestHandler):
    output_folder = ""  # set from main()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
            name = data.get("name", "unnamed")
            files = data.get("files", [])
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in name).strip() or "drawing"
            folder = os.path.join(UploadHandler.output_folder, f"{timestamp}_{safe_name}")
            os.makedirs(folder, exist_ok=True)
            saved = []
            for f in files:
                filename = f.get("filename", "file.txt")
                content = f.get("content", "")
                filepath = os.path.join(folder, filename)
                with open(filepath, "w", encoding="utf-8") as fh:
                    fh.write(content)
                saved.append(filename)
            stamp = datetime.datetime.now().strftime("%H:%M:%S")
            # Plain ASCII — Windows console defaults to cp1252 and would fail
            # on arrows / bullets, which then aborts the response with a 500.
            print(f"[{stamp}] Saved {len(saved)} file(s) -> {folder}")
            self._json(200, {"ok": True, "saved": saved})
        except Exception as e:
            print(f"[upload] Error: {e}")
            self._json(500, {"ok": False, "error": str(e)})

    def do_GET(self):
        # Health-check endpoint used by the app's "Test Connection" button.
        # The pid lets a fresh launch identify and close an older instance.
        self._json(200, {"ok": True, "server": SERVER_ID, "pid": os.getpid()})

    def _json(self, code, payload):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def log_message(self, fmt, *args):
        # Silence per-request access log; we print our own line on save.
        pass


# ---------- App server (port 8000) ----------

class AppHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SCRIPT_DIR), **kwargs)

    def end_headers(self):
        # Never let an iPad hold on to old code. SimpleHTTPRequestHandler sends only
        # Last-Modified, and with no Cache-Control iOS Safari applies its own guess at
        # how long a file stays fresh — which can be hours. Fix a bug mid-event and the
        # tablets would quietly keep running yesterday's JavaScript.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


class ExclusiveThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    # NOT reusable, deliberately. With SO_REUSEADDR set, Windows lets a second
    # process bind a port that is already being listened on — the bind succeeds,
    # both servers stay up, and which one answers any given request is arbitrary.
    # That is how a stale launcher can silently swallow uploads while everything
    # still looks healthy. Binding exclusively turns that into a clean error.
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if sys.platform == "win32":
            # SO_EXCLUSIVEADDRUSE is the Windows-side half of this: it stops anyone
            # else stealing the port even if they do ask for SO_REUSEADDR.
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, getattr(socket, "SO_EXCLUSIVEADDRUSE", -5), 1)
            except OSError:
                pass
        super().server_bind()


_running_servers = []

def start_server(port, handler, name):
    try:
        srv = ExclusiveThreadedTCPServer(("0.0.0.0", port), handler)
    except OSError as e:
        print(f"! Could not bind port {port} for {name}: {e}")
        return None
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    _running_servers.append(srv)
    return srv


def shutdown_all():
    """Called on Ctrl+C, Ctrl+Break, and Windows console close. Force-closes
    both sockets so ports 8000/8080 aren't left held after the console window
    is closed via the X button (Python doesn't handle that path by default)."""
    for srv in _running_servers:
        try:
            srv.shutdown()
        except Exception:
            pass
        try:
            srv.server_close()
        except Exception:
            pass
    _running_servers.clear()


def install_shutdown_hooks():
    import signal, atexit
    atexit.register(shutdown_all)

    def _handle(signum, frame):
        shutdown_all()
        # Force death — daemon threads or lingering sockets can otherwise keep
        # the process alive briefly after the console has closed.
        os._exit(0)

    signal.signal(signal.SIGINT, _handle)
    # SIGBREAK exists on Windows for Ctrl+Break.
    if hasattr(signal, "SIGBREAK"):
        try:
            signal.signal(signal.SIGBREAK, _handle)
        except Exception:
            pass

    # Windows: close-button on the console window doesn't raise a signal Python
    # catches by default. SetConsoleCtrlHandler grabs it via ctypes so we shut
    # the servers down before the OS kills the process.
    if sys.platform == "win32":
        try:
            import ctypes
            HANDLER = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_uint)
            CTRL_C_EVENT = 0
            CTRL_BREAK_EVENT = 1
            CTRL_CLOSE_EVENT = 2
            CTRL_LOGOFF_EVENT = 5
            CTRL_SHUTDOWN_EVENT = 6

            @HANDLER
            def _console_handler(ctrl_type):
                if ctrl_type in (CTRL_C_EVENT, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT,
                                 CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT):
                    shutdown_all()
                    os._exit(0)
                    return 1
                return 0

            # Keep a reference so ctypes doesn't garbage-collect the callback.
            install_shutdown_hooks._handler_ref = _console_handler
            ctypes.windll.kernel32.SetConsoleCtrlHandler(_console_handler, True)
        except Exception as e:
            print(f"(Note: could not install Windows close-handler: {e})")


# ---------- Single instance ----------

def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def identify_holder():
    """Ask whatever is sitting on the upload port who it is.

    Returns the pid if it's an older copy of this launcher, 0 if something we
    don't recognise is there, or None if the port is free. Self-verifying: we
    only ever close a process that answers with our own server id.
    """
    if not port_in_use(UPLOAD_PORT) and not port_in_use(APP_PORT):
        return None
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{UPLOAD_PORT}/", timeout=2) as r:
            data = json.loads(r.read().decode())
        if data.get("server") == SERVER_ID:
            return int(data.get("pid", 0))
    except Exception:
        pass
    return 0


def stop_previous_instance():
    """Close an older launcher still holding the ports. Returns True if we're clear."""
    holder = identify_holder()
    if holder is None:
        return True

    if not holder:
        print()
        print("  ! Ports 8000/8080 are held by something that isn't this launcher.")
        print("    Find it with:  netstat -ano | findstr \":8000 :8080\"")
        print("    Then close that program and start again.")
        return False

    if holder == os.getpid():
        return True

    print(f"  An older launcher is still running (PID {holder}). Closing it...")
    try:
        import signal as _signal
        os.kill(holder, _signal.SIGTERM)
    except Exception as e:
        print(f"  ! Could not close it: {e}")
        return False

    import time as _time
    for _ in range(24):
        _time.sleep(0.25)
        if not port_in_use(APP_PORT) and not port_in_use(UPLOAD_PORT):
            print("  Old launcher closed.")
            return True
    print("  ! The old launcher did not let go of the ports.")
    return False


# ---------- CLI arg helper ----------

def parse_cli_folder(argv):
    for i, a in enumerate(argv):
        if a in ("--folder", "-f") and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith("--folder="):
            return a.split("=", 1)[1]
    return None


# ---------- Main ----------

def main():
    if not (SCRIPT_DIR / "index.html").exists():
        print("index.html not found next to the launcher.")
        print(f"(Looking in: {SCRIPT_DIR})")
        input("Press Enter to exit...")
        return

    folder_arg = parse_cli_folder(sys.argv[1:])
    export_folder = get_export_folder(folder_arg)
    os.makedirs(export_folder, exist_ok=True)
    UploadHandler.output_folder = export_folder

    best_ip, other_ips = get_local_ips()

    install_shutdown_hooks()

    if not stop_previous_instance():
        print()
        input("Press Enter to exit...")
        return

    app_srv = start_server(APP_PORT, AppHandler, "app server")
    up_srv = start_server(UPLOAD_PORT, UploadHandler, "upload receiver")
    if not app_srv or not up_srv:
        print()
        print("Startup failed — port 8000 or 8080 is already in use.")
        print("Close whatever is using it and start again.")
        input("Press Enter to exit...")
        shutdown_all()
        return

    print()
    print("  De Alleseter - running")
    print("  ======================")
    print()
    print("  On the iPads, open:")
    print()
    print(f"      http://{best_ip}:{APP_PORT}")
    print()
    if other_ips:
        print("  (If that one doesn't load, try: "
              + ", ".join(f"http://{ip}:{APP_PORT}" for ip in other_ips) + ")")
        print()
    print(f"  Drawings save to: {export_folder}")
    print()
    print("  Tips:")
    print("    - First time on a new laptop? Run allow-firewall.bat once.")
    print("    - Close this window (X) or press Ctrl+C to stop. Both ports are")
    print("      released on the way out, and a fresh start closes any leftovers.")
    print()

    import time
    try:
        # Short interruptible sleeps so Ctrl+C lands quickly.
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nShutting down.")
        shutdown_all()


if __name__ == "__main__":
    main()
