import json
import os
import socket
import ssl
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
POOL = ROOT / "data" / "practice" / "pools" / "practice-python-313.json"
REAL = json.loads((Path(__file__).parent / "fixtures" / "tavily_real.json").read_text())
JIT = "https://docs-python.invalid/3.13/jit"
FREE = "https://docs-python.invalid/3.13/free-threading"


@pytest.fixture(scope="session")
def proxy(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("proxy")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    log = tmp / "search.jsonl"
    out = open(tmp / "mitmdump.out", "w")
    env = {**os.environ, "ASSAY_POOL_FILE": str(POOL), "ASSAY_SEARCH_LOG": str(log)}
    p = subprocess.Popen(
        [sys.executable, "-c", "from mitmproxy.tools.main import mitmdump; mitmdump()",
         "-s", str(ROOT / "backend" / "assay" / "proxy.py"), "--listen-host", "127.0.0.1",
         "--listen-port", str(port), "--set", f"confdir={tmp}"],
        env=env, cwd=ROOT / "backend", stdout=out, stderr=subprocess.STDOUT,
    )
    ca = tmp / "mitmproxy-ca-cert.pem"
    for _ in range(300):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            if ca.exists():
                break
        except OSError:
            pass
        assert p.poll() is None, "mitmdump exited at startup:\n" + (tmp / "mitmdump.out").read_text()
        time.sleep(0.1)
    else:
        p.kill()
        pytest.fail("proxy did not come up:\n" + (tmp / "mitmdump.out").read_text())
    with httpx.Client(proxy=f"http://127.0.0.1:{port}", verify=ssl.create_default_context(cafile=str(ca)), timeout=10) as c:
        c.log = log
        c.port = port
        yield c
    p.kill()
    p.wait()
    out.close()


def search(c, **body):
    return c.post("https://api.tavily.com/search", json=body)


def log_lines(c):
    return [json.loads(x) for x in c.log.read_text().splitlines()] if c.log.exists() else []


def test_search_ranks_pool_docs(proxy):
    r = search(proxy, query="free threaded build")
    assert r.status_code == 200
    body = r.json()
    assert [x["url"] for x in body["results"]] == [FREE, JIT]
    assert body["query"] == "free threaded build"
    assert body["results"][0]["score"] == 1.0
    assert 0 < body["results"][1]["score"] < 1
    assert body["results"][0]["raw_content"] is None


def test_search_matches_real_tavily_shape(proxy):
    body = search(proxy, query="free threaded build", include_raw_content=True).json()
    real = REAL["search"]
    assert set(real) - {"request_id"} <= set(body) <= set(real)
    assert set(real["results"][0]) - {"id"} <= set(body["results"][0]) <= set(real["results"][0]) | {"published_date"}
    assert body["results"][0]["raw_content"].startswith("Python 3.13 ships")


def test_search_max_results(proxy):
    assert len(search(proxy, query="free threaded build", max_results=1).json()["results"]) == 1


def test_extract(proxy):
    body = proxy.post("https://api.tavily.com/extract", json={"urls": [JIT, "https://nope.invalid/x"]}).json()
    assert [x["url"] for x in body["results"]] == [JIT]
    assert "just-in-time compiler" in body["results"][0]["raw_content"]
    assert body["failed_results"] == [{"url": "https://nope.invalid/x", "error": "Failed to fetch url"}]
    real = REAL["extract"]
    assert set(real) - {"request_id"} <= set(body) <= set(real)
    assert set(body["results"][0]) == set(real["results"][0])


def test_unknown_tavily_path_404(proxy):
    assert proxy.post("https://api.tavily.com/crawl", json={}).status_code == 404


def test_fetch_pool_url(proxy):
    r = proxy.get(JIT + "/#frag")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "just-in-time compiler" in r.text and "<title>Experimental JIT compiler</title>" in r.text


def test_fetch_non_pool_url_404(proxy):
    assert proxy.get("https://docs-python.invalid/nope").status_code == 404


def test_log_lines(proxy):
    n = len(log_lines(proxy))
    search(proxy, query="free threaded build")
    proxy.post("https://api.tavily.com/extract", json={"urls": JIT})
    proxy.get(FREE)
    proxy.get("https://docs-python.invalid/nope")
    new = log_lines(proxy)[n:]
    assert all(isinstance(x.pop("t"), float) for x in new)
    assert new == [
        {"kind": "search", "query": "free threaded build", "results": [FREE, JIT]},
        {"kind": "extract", "urls": [JIT], "results": [JIT]},
        {"kind": "fetch", "url": FREE, "results": [FREE]},
        {"kind": "fetch", "url": "https://docs-python.invalid/nope", "results": []},
    ]


def test_localhost_passthrough(proxy):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"real-local-body")

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    n = len(log_lines(proxy))
    r = proxy.get(f"http://127.0.0.1:{srv.server_port}/")
    srv.shutdown()
    srv.server_close()
    assert r.text == "real-local-body"
    assert len(log_lines(proxy)) == n


@pytest.mark.parametrize("path,body", [("/search", "{"), ("/search", "{}"), ("/extract", "{}")])
def test_malformed_tavily_body_fails_closed(proxy, path, body):
    r = proxy.post("https://api.tavily.com" + path, content=body)
    assert (r.status_code, r.text) == (500, "assay proxy error")


def test_spoofed_localhost_host_header_is_not_passthrough(proxy):
    r = proxy.get("https://pool-only.invalid/page", headers={"Host": "localhost"})
    assert (r.status_code, r.text) == (404, "not in pool")


def test_raw_tcp_over_connect_is_not_relayed(proxy):
    # A local TCP sentinel stands in for a real host: it must never get the bytes.
    got = []
    srv = socket.create_server(("127.0.0.1", 0))
    srv.settimeout(5)

    def accept():
        try:
            conn, _ = srv.accept()
            conn.settimeout(3)
            got.append(conn.recv(100))
        except OSError:
            pass

    t = threading.Thread(target=accept)
    t.start()
    port = srv.getsockname()[1]
    proxy_port = proxy.port
    k = socket.create_connection(("127.0.0.1", proxy_port))
    k.sendall(f"CONNECT 127.0.0.1:{port} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n".encode())
    assert k.recv(100).startswith(b"HTTP/1.1 200")
    k.sendall(b"\x00\x01binary-not-http\r\n")
    k.settimeout(5)
    try:
        k.recv(100)
    except OSError:
        pass
    k.close()
    t.join()
    srv.close()
    assert got in ([], [b""])
