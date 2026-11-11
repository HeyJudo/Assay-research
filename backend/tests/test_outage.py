import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx
import pytest

BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND / "assay" / "outage.py"
OUTAGE = {"error": {"message": "Service temporarily unavailable", "type": "server_error"}}


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def sentinel():
    """Local HTTP server standing in for Bifrost. Records request paths."""
    hits = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            hits.append(self.path)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok": true}')

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, hits


def launch(tmp, mode):
    port, out = free_port(), open(tmp / "mitmdump.out", "w")
    cmd = [sys.executable, "-c", "from mitmproxy.tools.main import mitmdump; mitmdump()",
           "-s", str(SCRIPT), "--listen-host", "127.0.0.1", "--listen-port", str(port),
           "--set", f"confdir={tmp}", "--mode", mode]
    return subprocess.Popen(cmd, cwd=BACKEND, stdout=out, stderr=subprocess.STDOUT), port


def wait_up(p, port):
    for _ in range(300):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            return
        except OSError:
            assert p.poll() is None, "mitmdump exited at startup"
            time.sleep(0.1)
    pytest.fail("add-on did not come up")


@pytest.fixture
def outage(tmp_path):
    srv, hits = sentinel()
    p, port = launch(tmp_path, f"reverse:http://127.0.0.1:{srv.server_port}")
    try:
        wait_up(p, port)
        yield f"http://127.0.0.1:{port}", hits
    finally:
        p.kill()
        srv.shutdown()


def post(base, path):
    return httpx.post(base + path, json={}, timeout=10)


def test_first_three_calls_fail(outage):
    base, hits = outage
    rs = [post(base, "/r/run_a/v1/chat/completions") for _ in range(4)]
    assert [r.status_code for r in rs] == [503, 503, 503, 200]
    assert all(r.json() == OUTAGE and r.headers["content-type"] == "application/json" for r in rs[:3])
    assert hits == ["/v1/chat/completions"]


def test_per_run_counter(outage):
    base, _ = outage
    for _ in range(4):
        post(base, "/r/run_a/v1/chat/completions")
    assert post(base, "/r/run_b/v1/chat/completions").status_code == 503


def test_untagged_path_rejected(outage):
    base, hits = outage
    r = post(base, "/v1/chat/completions")
    assert r.status_code == 400
    assert r.json() == {"error": {"message": "missing run tag", "type": "invalid_request_error"}}
    assert hits == []


def test_refuses_non_reverse_mode(tmp_path):
    p, port = launch(tmp_path, "regular")
    try:
        p.wait(timeout=30)
    finally:
        p.kill()
    with pytest.raises(OSError):
        socket.create_connection(("127.0.0.1", port), timeout=0.5)
