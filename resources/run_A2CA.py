#!/usr/bin/env python3
"""Local A2CA launcher.

Serves the static A2CA files on localhost and provides a narrowly scoped
same-origin proxy for the NCBI BLAST Common URL API and NCBI Protein EFetch.
The launcher also tracks the active A2CA browser session through a persistent
loopback connection and shuts itself down shortly after the browser/tab is closed.
No third-party Python packages are required.
"""

from __future__ import annotations

import sys
import socket
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
START_PORT = 8765
END_PORT = 8799
MAX_REQUEST_BODY = 2 * 1024 * 1024

NCBI_TARGETS = {
    "/api/ncbi/blast": "https://blast.ncbi.nlm.nih.gov/Blast.cgi",
    "/api/ncbi/efetch": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
}
RCSB_PDB_ENDPOINT = "/api/rcsb/pdb"
LIFECYCLE_HEARTBEAT = "/api/a2ca/heartbeat"
LIFECYCLE_PAGEHIDE = "/api/a2ca/pagehide"
LIFECYCLE_STREAM = "/api/a2ca/stream"
USER_AGENT = "A2CA/2.0.40 (NCBI BLAST client; local interactive application)"

BLAST_ALLOWED_PARAMS = {
    "CMD", "PROGRAM", "DATABASE", "QUERY", "EXPECT", "HITLIST_SIZE", "GAPCOSTS",
    "MATRIX", "WORD_SIZE", "FILTER", "COMPOSITION_BASED_STATISTICS", "SHORT_QUERY_ADJUST",
    "tool", "email", "RID", "FORMAT_OBJECT", "FORMAT_TYPE", "ALIGNMENT_VIEW", "DESCRIPTIONS", "ALIGNMENTS"
}
EFETCH_ALLOWED_PARAMS = {"db", "id", "rettype", "retmode", "tool", "email"}
BLAST_DATABASES = {"nr_cluster_seq", "nr", "refseq_protein", "swissprot", "pdb"}


class LifecycleState:
    """Tracks active browser tabs so the launcher can exit when A2CA is closed."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.clients: dict[str, float] = {}
        self.streams: set[str] = set()
        self.seen_client = False
        self.shutdown_deadline: float | None = None

    def heartbeat(self, client: str) -> None:
        now = time.monotonic()
        with self.lock:
            self.seen_client = True
            self.clients[client] = now
            self.shutdown_deadline = None

    def pagehide(self, client: str) -> None:
        now = time.monotonic()
        with self.lock:
            self.clients.pop(client, None)
            self._prune_locked(now)
            if self.seen_client and not self.clients and not self.streams:
                # Normal navigation/reload can briefly remove the active document.
                # Give the replacement page a short grace period to reconnect.
                self.shutdown_deadline = now + 6.0

    def stream_open(self, client: str) -> None:
        now = time.monotonic()
        with self.lock:
            self.seen_client = True
            self.streams.add(client)
            self.clients[client] = now
            self.shutdown_deadline = None

    def stream_close(self, client: str) -> None:
        now = time.monotonic()
        with self.lock:
            self.streams.discard(client)
            self.clients.pop(client, None)
            if self.seen_client and not self.streams and not self.clients:
                self.shutdown_deadline = now + 6.0

    def should_shutdown(self) -> bool:
        now = time.monotonic()
        with self.lock:
            self._prune_locked(now)
            if self.shutdown_deadline is not None and now >= self.shutdown_deadline and not self.clients and not self.streams:
                return True
            # Fallback if pagehide/sendBeacon is lost (browser crash, forced quit).
            # A normal background tab remains registered; stale clients are only
            # discarded after a deliberately generous timeout.
            if self.seen_client and not self.clients and not self.streams and self.shutdown_deadline is None:
                self.shutdown_deadline = now + 6.0
            return False

    def _prune_locked(self, now: float) -> None:
        # The event-stream is the primary close detector. Heartbeats remain a
        # fallback for browsers that cannot establish it, so they may expire much
        # sooner than in earlier versions without penalizing background tabs.
        stale = [client for client, last in self.clients.items() if now - last > 30.0 and client not in self.streams]
        for client in stale:
            self.clients.pop(client, None)
        if stale and self.seen_client and not self.clients and not self.streams and self.shutdown_deadline is None:
            self.shutdown_deadline = now + 6.0


LIFECYCLE = LifecycleState()


class A2CAHandler(SimpleHTTPRequestHandler):
    server_version = "A2CA/1.2"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        path = getattr(self, "path", "")
        if path.startswith("/api/") and not path.startswith("/api/a2ca/"):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def _allowed_origins(self):
        port = self.server.server_address[1]
        return {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}

    def _check_local_api_request(self) -> bool:
        host = (self.headers.get("Host") or "").lower()
        allowed_hosts = {origin.split("//", 1)[1].lower() for origin in self._allowed_origins()}
        if host not in allowed_hosts:
            self.send_error(403, "A2CA API rejected an unexpected Host header")
            return False
        origin = (self.headers.get("Origin") or "").rstrip("/")
        referer = self.headers.get("Referer") or ""
        fetch_site = (self.headers.get("Sec-Fetch-Site") or "").lower()
        if origin and origin not in self._allowed_origins():
            self.send_error(403, "A2CA API rejected a cross-origin request")
            return False
        if not origin and referer and not any(referer.startswith(o + "/") for o in self._allowed_origins()):
            self.send_error(403, "A2CA API rejected an unexpected referrer")
            return False
        if fetch_site == "cross-site":
            self.send_error(403, "A2CA API rejected a cross-site request")
            return False
        return True

    @staticmethod
    def _flat_params(encoded: str):
        parsed = urllib.parse.parse_qs(encoded, keep_blank_values=True, strict_parsing=False)
        return {k: values[-1] if values else "" for k, values in parsed.items()}

    def _validate_proxy_params(self, proxy_path: str, encoded: str):
        params = self._flat_params(encoded)
        allowed = BLAST_ALLOWED_PARAMS if proxy_path == "/api/ncbi/blast" else EFETCH_ALLOWED_PARAMS
        unknown = set(params) - allowed
        if unknown:
            raise ValueError("Unsupported proxy parameter(s): " + ", ".join(sorted(unknown)))
        if proxy_path == "/api/ncbi/blast":
            cmd = params.get("CMD", "")
            if cmd not in {"Put", "Get"}: raise ValueError("BLAST CMD must be Put or Get")
            if cmd == "Put":
                if params.get("PROGRAM") != "blastp": raise ValueError("Only blastp is supported")
                if params.get("DATABASE") not in BLAST_DATABASES: raise ValueError("Unsupported BLAST database")
                query = params.get("QUERY", "")
                if not query or len(query) > 1_000_000: raise ValueError("BLAST query is empty or too large")
                try:
                    expect = float(params.get("EXPECT", "0.05")); hits = int(params.get("HITLIST_SIZE", "100"))
                except ValueError: raise ValueError("Invalid BLAST numeric parameter")
                if not (0 < expect <= 1000): raise ValueError("BLAST EXPECT is outside the allowed range")
                if not (1 <= hits <= 5000): raise ValueError("BLAST HITLIST_SIZE is outside the allowed range")
                if params.get("WORD_SIZE") not in {None, "", "3", "5", "6"}: raise ValueError("Unsupported BLAST word size")
                if params.get("MATRIX") not in {None, "", "BLOSUM45", "BLOSUM50", "BLOSUM62", "BLOSUM80", "BLOSUM90", "PAM250", "PAM30", "PAM70"}: raise ValueError("Unsupported BLAST matrix")
                if params.get("GAPCOSTS") not in {None, "", "11 2", "10 2", "9 2", "8 2", "7 2", "6 2", "13 1", "12 1", "11 1", "10 1", "9 1"}: raise ValueError("Unsupported BLAST gap costs")
                if params.get("FILTER") not in {None, "", "L"}: raise ValueError("Unsupported BLAST FILTER value")
                if params.get("COMPOSITION_BASED_STATISTICS") not in {None, "", "0", "1", "2", "3"}: raise ValueError("Unsupported composition statistics value")
                if params.get("SHORT_QUERY_ADJUST") not in {None, "", "true"}: raise ValueError("Unsupported short-query adjustment value")
            else:
                rid = params.get("RID", "")
                if not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", rid): raise ValueError("Invalid BLAST RID")
                if params.get("FORMAT_OBJECT") not in {None, "", "SearchInfo"}: raise ValueError("Unsupported FORMAT_OBJECT")
                if params.get("FORMAT_TYPE") not in {None, "", "Text"}: raise ValueError("Unsupported FORMAT_TYPE")
                if params.get("ALIGNMENT_VIEW") not in {None, "", "Tabular"}: raise ValueError("Unsupported ALIGNMENT_VIEW")
                for key in ("DESCRIPTIONS", "ALIGNMENTS"):
                    if params.get(key) not in {None, ""}:
                        try: value = int(params[key])
                        except ValueError: raise ValueError(f"Invalid BLAST {key}")
                        if not (1 <= value <= 5000): raise ValueError(f"BLAST {key} is outside the allowed range")
        else:
            if params.get("db") != "protein": raise ValueError("Only NCBI protein EFetch is supported")
            if params.get("rettype") != "fasta" or params.get("retmode") != "text": raise ValueError("EFetch is restricted to protein FASTA text")
            ids = params.get("id", "")
            if not ids or len(ids) > 200_000: raise ValueError("EFetch identifier list is empty or too large")
        return urllib.parse.urlencode(params)

    def _lifecycle_stream(self, parsed: urllib.parse.SplitResult) -> bool:
        if parsed.path != LIFECYCLE_STREAM:
            return False
        params = urllib.parse.parse_qs(parsed.query)
        client = (params.get("client") or [""])[0].strip()
        if not client:
            self.send_error(400, "Missing lifecycle client id")
            return True

        LIFECYCLE.stream_open(client)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        try:
            # A persistent loopback connection lets the launcher detect a full
            # browser/tab close even when pagehide/sendBeacon never reaches Python.
            while True:
                self.wfile.write(b": a2ca-alive\n\n")
                self.wfile.flush()
                time.sleep(2.0)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            LIFECYCLE.stream_close(client)
        return True

    def _lifecycle(self, parsed: urllib.parse.SplitResult) -> bool:
        if parsed.path not in {LIFECYCLE_HEARTBEAT, LIFECYCLE_PAGEHIDE}:
            return False
        params = urllib.parse.parse_qs(parsed.query)
        client = (params.get("client") or [""])[0].strip()
        if not client:
            self.send_error(400, "Missing lifecycle client id")
            return True
        if parsed.path == LIFECYCLE_HEARTBEAT:
            LIFECYCLE.heartbeat(client)
        else:
            LIFECYCLE.pagehide(client)
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path.startswith("/api/") and not self._check_local_api_request():
            return
        if self._lifecycle_stream(parsed):
            return
        if self._lifecycle(parsed):
            return
        if parsed.path in NCBI_TARGETS:
            self._proxy_ncbi(parsed.path, parsed.query, body=None)
            return
        if parsed.path == RCSB_PDB_ENDPOINT:
            self._fetch_rcsb_pdb(parsed.query)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path.startswith("/api/") and not self._check_local_api_request():
            return
        if self._lifecycle(parsed):
            # Drain a possible sendBeacon payload so the connection can close cleanly.
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length:
                self.rfile.read(min(length, MAX_REQUEST_BODY))
            return
        if parsed.path not in NCBI_TARGETS:
            self.send_error(405, "POST is only supported for A2CA API endpoints")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "Invalid Content-Length")
            return
        if length < 0 or length > MAX_REQUEST_BODY:
            self.send_error(413, "Request body too large")
            return
        body = self.rfile.read(length) if length else b""
        if parsed.path == "/api/ncbi/blast" and body:
            try:
                params = urllib.parse.parse_qs(body.decode("utf-8", "replace"))
                query = (params.get("QUERY") or [""])[0]
                print(
                    "BLAST submit:",
                    f"program={(params.get('PROGRAM') or [''])[0]}",
                    f"database={(params.get('DATABASE') or [''])[0]}",
                    f"query_chars={len(query)}",
                    f"word_size={(params.get('WORD_SIZE') or [''])[0]}",
                    f"hits={(params.get('HITLIST_SIZE') or [''])[0]}",
                    flush=True,
                )
            except Exception:
                pass
        self._proxy_ncbi(parsed.path, parsed.query, body=body)


    def _fetch_rcsb_pdb(self, query: str):
        params = urllib.parse.parse_qs(query)
        pdb_id = (params.get("id") or [""])[0].strip().upper()
        if not pdb_id or not (len(pdb_id) == 4 and pdb_id.isalnum()):
            self.send_error(400, "Provide a valid four-character PDB identifier")
            return
        target = f"https://files.rcsb.org/download/{urllib.parse.quote(pdb_id)}.pdb"
        request = urllib.request.Request(target, headers={"User-Agent": USER_AGENT, "Accept": "text/plain"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read(25 * 1024 * 1024 + 1)
                if len(payload) > 25 * 1024 * 1024:
                    raise ValueError("RCSB structure exceeds the 25 MB safety limit")
                status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read(1024 * 1024)
            status = exc.code
        except Exception as exc:
            payload = ("A2CA could not retrieve the PDB structure from RCSB: " + str(exc)).encode("utf-8", "replace")
            status = 502
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_ncbi(self, proxy_path: str, query: str, body: bytes | None):
        target = NCBI_TARGETS[proxy_path]
        try:
            if body is not None:
                encoded = body.decode("utf-8", "strict")
                safe_encoded = self._validate_proxy_params(proxy_path, encoded)
                outbound_body = safe_encoded.encode("utf-8")
                outbound_query = ""
            else:
                safe_encoded = self._validate_proxy_params(proxy_path, query)
                outbound_body = None
                outbound_query = safe_encoded
        except (UnicodeDecodeError, ValueError) as exc:
            self.send_error(400, str(exc))
            return

        if outbound_query:
            target += "?" + outbound_query
        headers = {"User-Agent": USER_AGENT, "Accept": "text/plain, application/xml;q=0.9, */*;q=0.1"}
        if outbound_body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8"
        request = urllib.request.Request(target, data=outbound_body, headers=headers, method="POST" if outbound_body is not None else "GET")
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = response.read();status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read();status = exc.code
        except Exception as exc:
            payload = ("A2CA local proxy could not reach NCBI: " + str(exc) + "\nCheck the internet connection, VPN/firewall/proxy settings, and retry.").encode("utf-8", "replace")
            status = 502
        self.send_response(status)
        # Never reflect remote HTML as executable/renderable content. JavaScript clients
        # Consume BLAST/EFetch responses as inert text. BLAST hit retrieval uses the documented tabular text report.
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Disposition", "inline")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers();self.wfile.write(payload)


def create_server() -> tuple[ThreadingHTTPServer, int]:
    last_error = None
    for port in range(START_PORT, END_PORT + 1):
        try:
            server = ThreadingHTTPServer((HOST, port), A2CAHandler)
            return server, port
        except OSError as exc:
            last_error = exc
    raise RuntimeError(f"No free local port found between {START_PORT} and {END_PORT}: {last_error}")


def lifecycle_monitor(server: ThreadingHTTPServer) -> None:
    while True:
        time.sleep(1.0)
        if LIFECYCLE.should_shutdown():
            print("\nA2CA browser session closed. Stopping local server...")
            server.shutdown()
            return


def main() -> int:
    try:
        server, port = create_server()
    except Exception as exc:
        print(f"Could not start A2CA: {exc}", file=sys.stderr)
        return 1

    url = f"http://{HOST}:{port}/resources/upload.html"
    print("A2CA online mode local server is running.")
    print(f"Open: {url}")
    print("The launcher will stop automatically when the A2CA browser tab/window is closed.")
    print("Press Ctrl+C to stop it manually.")
    print("NCBI BLAST traffic and RCSB PDB retrieval are proxied locally to avoid browser CORS restrictions.")

    monitor = threading.Thread(target=lifecycle_monitor, args=(server,), daemon=True)
    monitor.start()

    timer = threading.Timer(0.4, lambda: webbrowser.open(url, new=2))
    timer.daemon = True
    timer.start()

    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nStopping A2CA...")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
