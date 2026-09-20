#!/usr/bin/env python3
"""A2CA web server for hosted deployments (Railway-ready).

The browser UI is served from ``resources/``.  The server also exposes a very
small same-origin proxy used by A2CA for NCBI BLAST/Protein EFetch and RCSB PDB
retrieval.  No user analysis data are intentionally persisted on disk.

This hosted server is deliberately separate from the former desktop launcher:
it does not open a browser, does not use browser heartbeats, and does not shut
down when a user closes a tab.
"""

from __future__ import annotations

import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
MAX_REQUEST_BODY = 2 * 1024 * 1024
MAX_REMOTE_RESPONSE = 25 * 1024 * 1024
USER_AGENT = "A2CA/2.0.41 (Amino Acid Cluster Analysis; hosted web application)"
API_HEADER = "X-A2CA-Request"
API_HEADER_VALUE = "web"

NCBI_TARGETS = {
    "/api/ncbi/blast": "https://blast.ncbi.nlm.nih.gov/Blast.cgi",
    "/api/ncbi/efetch": "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
}
RCSB_PDB_ENDPOINT = "/api/rcsb/pdb"

BLAST_ALLOWED_PARAMS = {
    "CMD", "PROGRAM", "DATABASE", "QUERY", "EXPECT", "HITLIST_SIZE", "GAPCOSTS",
    "MATRIX", "WORD_SIZE", "FILTER", "COMPOSITION_BASED_STATISTICS",
    "SHORT_QUERY_ADJUST", "tool", "email", "RID", "FORMAT_OBJECT", "FORMAT_TYPE",
    "ALIGNMENT_VIEW", "DESCRIPTIONS", "ALIGNMENTS",
}
EFETCH_ALLOWED_PARAMS = {"db", "id", "rettype", "retmode", "tool", "email"}
BLAST_DATABASES = {"nr_cluster_seq", "nr", "refseq_protein", "swissprot", "pdb"}


class SlidingWindowLimiter:
    """Small in-memory abuse guard suitable for a single Railway replica."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def allow(self, client: str, bucket: str, limit: int, window_seconds: float) -> bool:
        now = time.monotonic()
        key = (client, bucket)
        with self._lock:
            q = self._events[key]
            cutoff = now - window_seconds
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


RATE_LIMITER = SlidingWindowLimiter()
BLAST_GATE_LOCK = threading.Lock()
BLAST_LAST_REQUEST = 0.0


def throttle_blast_requests() -> None:
    """Respect NCBI's conservative remote-BLAST contact cadence per server IP."""
    global BLAST_LAST_REQUEST
    with BLAST_GATE_LOCK:
        now = time.monotonic()
        wait = 10.0 - (now - BLAST_LAST_REQUEST)
        if wait > 0:
            time.sleep(wait)
        BLAST_LAST_REQUEST = time.monotonic()


def read_limited(response, limit: int = MAX_REMOTE_RESPONSE) -> bytes:
    payload = response.read(limit + 1)
    if len(payload) > limit:
        raise ValueError("Remote response exceeded the A2CA safety limit")
    return payload


class A2CAServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class A2CAHandler(SimpleHTTPRequestHandler):
    server_version = "A2CA-Web/2.0.41"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # Keep standard access logs, but never log request bodies.
        super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _client_ip(self) -> str:
        forwarded = self.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()[:128]
        return str(self.client_address[0])[:128]

    def _api_request_allowed(self) -> bool:
        # The custom header cannot be sent cross-origin by a normal browser without
        # a successful CORS preflight; this server intentionally provides no CORS.
        if self.headers.get(API_HEADER) != API_HEADER_VALUE:
            self._plain_error(HTTPStatus.FORBIDDEN, "Missing A2CA same-origin request header")
            return False

        host = (self.headers.get("Host") or "").lower()
        if not host:
            self._plain_error(HTTPStatus.BAD_REQUEST, "Missing Host header")
            return False

        origin = (self.headers.get("Origin") or "").strip()
        if origin:
            parsed = urllib.parse.urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() != host:
                self._plain_error(HTTPStatus.FORBIDDEN, "Cross-origin API request rejected")
                return False

        referer = (self.headers.get("Referer") or "").strip()
        if referer and not origin:
            parsed = urllib.parse.urlsplit(referer)
            if parsed.netloc.lower() != host:
                self._plain_error(HTTPStatus.FORBIDDEN, "Unexpected API referrer")
                return False

        if (self.headers.get("Sec-Fetch-Site") or "").lower() == "cross-site":
            self._plain_error(HTTPStatus.FORBIDDEN, "Cross-site API request rejected")
            return False

        client = self._client_ip()
        if not RATE_LIMITER.allow(client, "api", 120, 60.0):
            self._plain_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many A2CA API requests; please retry shortly")
            return False
        return True

    def _plain_error(self, status: int | HTTPStatus, message: str) -> None:
        payload = (str(message).strip() + "\n").encode("utf-8", "replace")
        self.send_response(int(status))
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    @staticmethod
    def _flat_params(encoded: str) -> dict[str, str]:
        parsed = urllib.parse.parse_qs(encoded, keep_blank_values=True, strict_parsing=False)
        return {k: values[-1] if values else "" for k, values in parsed.items()}

    def _validate_proxy_params(self, proxy_path: str, encoded: str) -> str:
        params = self._flat_params(encoded)
        allowed = BLAST_ALLOWED_PARAMS if proxy_path == "/api/ncbi/blast" else EFETCH_ALLOWED_PARAMS
        unknown = set(params) - allowed
        if unknown:
            raise ValueError("Unsupported proxy parameter(s): " + ", ".join(sorted(unknown)))

        if proxy_path == "/api/ncbi/blast":
            cmd = params.get("CMD", "")
            if cmd not in {"Put", "Get"}:
                raise ValueError("BLAST CMD must be Put or Get")
            if cmd == "Put":
                if params.get("PROGRAM") != "blastp":
                    raise ValueError("Only blastp is supported")
                if params.get("DATABASE") not in BLAST_DATABASES:
                    raise ValueError("Unsupported BLAST database")
                query = params.get("QUERY", "")
                if not query or len(query) > 1_000_000:
                    raise ValueError("BLAST query is empty or too large")
                try:
                    expect = float(params.get("EXPECT", "0.05"))
                    hits = int(params.get("HITLIST_SIZE", "100"))
                except ValueError as exc:
                    raise ValueError("Invalid BLAST numeric parameter") from exc
                if not (0 < expect <= 1000):
                    raise ValueError("BLAST EXPECT is outside the allowed range")
                if not (1 <= hits <= 5000):
                    raise ValueError("BLAST HITLIST_SIZE is outside the allowed range")
                if params.get("WORD_SIZE") not in {None, "", "3", "5", "6"}:
                    raise ValueError("Unsupported BLAST word size")
                if params.get("MATRIX") not in {None, "", "BLOSUM45", "BLOSUM50", "BLOSUM62", "BLOSUM80", "BLOSUM90", "PAM250", "PAM30", "PAM70"}:
                    raise ValueError("Unsupported BLAST matrix")
                if params.get("GAPCOSTS") not in {None, "", "11 2", "10 2", "9 2", "8 2", "7 2", "6 2", "13 1", "12 1", "11 1", "10 1", "9 1"}:
                    raise ValueError("Unsupported BLAST gap costs")
                if params.get("FILTER") not in {None, "", "L"}:
                    raise ValueError("Unsupported BLAST FILTER value")
                if params.get("COMPOSITION_BASED_STATISTICS") not in {None, "", "0", "1", "2", "3"}:
                    raise ValueError("Unsupported composition statistics value")
                if params.get("SHORT_QUERY_ADJUST") not in {None, "", "true"}:
                    raise ValueError("Unsupported short-query adjustment value")
            else:
                rid = params.get("RID", "")
                if not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", rid):
                    raise ValueError("Invalid BLAST RID")
                if params.get("FORMAT_OBJECT") not in {None, "", "SearchInfo"}:
                    raise ValueError("Unsupported FORMAT_OBJECT")
                if params.get("FORMAT_TYPE") not in {None, "", "Text"}:
                    raise ValueError("Unsupported FORMAT_TYPE")
                if params.get("ALIGNMENT_VIEW") not in {None, "", "Tabular"}:
                    raise ValueError("Unsupported ALIGNMENT_VIEW")
                for key in ("DESCRIPTIONS", "ALIGNMENTS"):
                    if params.get(key) not in {None, ""}:
                        try:
                            value = int(params[key])
                        except ValueError as exc:
                            raise ValueError(f"Invalid BLAST {key}") from exc
                        if not (1 <= value <= 5000):
                            raise ValueError(f"BLAST {key} is outside the allowed range")
        else:
            if params.get("db") != "protein":
                raise ValueError("Only NCBI protein EFetch is supported")
            if params.get("rettype") != "fasta" or params.get("retmode") != "text":
                raise ValueError("EFetch is restricted to protein FASTA text")
            ids = params.get("id", "")
            if not ids or len(ids) > 200_000:
                raise ValueError("EFetch identifier list is empty or too large")

        return urllib.parse.urlencode(params)

    def _send_text(self, status: int, payload: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Disposition", "inline")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_ncbi(self, proxy_path: str, query: str, body: bytes | None) -> None:
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
            self._plain_error(HTTPStatus.BAD_REQUEST, str(exc))
            return

        params = self._flat_params(safe_encoded)
        client = self._client_ip()
        if proxy_path == "/api/ncbi/blast" and params.get("CMD") == "Put":
            if not RATE_LIMITER.allow(client, "blast-submit", 10, 3600.0):
                self._plain_error(HTTPStatus.TOO_MANY_REQUESTS, "BLAST submission limit reached for this client; retry later")
                return

        if outbound_query:
            target += "?" + outbound_query

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/plain, application/xml;q=0.9, */*;q=0.1",
        }
        if outbound_body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8"

        if proxy_path == "/api/ncbi/blast":
            throttle_blast_requests()

        req = urllib.request.Request(
            target,
            data=outbound_body,
            headers=headers,
            method="POST" if outbound_body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                payload = read_limited(response)
                status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read(min(MAX_REMOTE_RESPONSE, 1024 * 1024))
            status = exc.code
        except Exception as exc:  # network/service failures are returned as inert text
            payload = ("A2CA server could not reach NCBI: " + str(exc)).encode("utf-8", "replace")
            status = HTTPStatus.BAD_GATEWAY

        self._send_text(int(status), payload)

    def _fetch_rcsb_pdb(self, query: str) -> None:
        params = urllib.parse.parse_qs(query)
        pdb_id = (params.get("id") or [""])[0].strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{4}", pdb_id):
            self._plain_error(HTTPStatus.BAD_REQUEST, "Provide a valid four-character PDB identifier")
            return

        client = self._client_ip()
        if not RATE_LIMITER.allow(client, "rcsb", 30, 60.0):
            self._plain_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many RCSB retrieval requests; retry shortly")
            return

        target = f"https://files.rcsb.org/download/{urllib.parse.quote(pdb_id)}.pdb"
        req = urllib.request.Request(target, headers={"User-Agent": USER_AGENT, "Accept": "text/plain"})
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                payload = read_limited(response)
                status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read(1024 * 1024)
            status = exc.code
        except Exception as exc:
            payload = ("A2CA server could not retrieve the PDB structure from RCSB: " + str(exc)).encode("utf-8", "replace")
            status = HTTPStatus.BAD_GATEWAY
        self._send_text(int(status), payload)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)

        if parsed.path == "/health":
            payload = b"ok\n"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/resources/upload.html")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if parsed.path.startswith("/api/"):
            if not self._api_request_allowed():
                return
            if parsed.path in NCBI_TARGETS:
                self._proxy_ncbi(parsed.path, parsed.query, body=None)
                return
            if parsed.path == RCSB_PDB_ENDPOINT:
                self._fetch_rcsb_pdb(parsed.query)
                return
            self._plain_error(HTTPStatus.NOT_FOUND, "Unknown A2CA API endpoint")
            return

        # Only publish the web application itself. Repository metadata and server
        # source files are not exposed through the hosted site.
        if parsed.path == "/resources" or parsed.path.startswith("/resources/"):
            super().do_GET()
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        if not parsed.path.startswith("/api/"):
            self._plain_error(HTTPStatus.METHOD_NOT_ALLOWED, "POST is only supported for A2CA API endpoints")
            return
        if not self._api_request_allowed():
            return
        if parsed.path not in NCBI_TARGETS:
            self._plain_error(HTTPStatus.METHOD_NOT_ALLOWED, "POST is only supported for NCBI proxy endpoints")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._plain_error(HTTPStatus.BAD_REQUEST, "Invalid Content-Length")
            return
        if length < 0 or length > MAX_REQUEST_BODY:
            self._plain_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body too large")
            return

        body = self.rfile.read(length) if length else b""
        self._proxy_ncbi(parsed.path, parsed.query, body=body)

    def do_OPTIONS(self):
        # Deliberately do not enable CORS for API endpoints.
        self._plain_error(HTTPStatus.FORBIDDEN, "Cross-origin API access is not supported")


def main() -> int:
    server = A2CAServer((HOST, PORT), A2CAHandler)
    print(f"A2CA web server listening on {HOST}:{PORT}", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("Stopping A2CA web server…", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
