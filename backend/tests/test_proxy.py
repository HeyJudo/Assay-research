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
    env = {**os.environ, "ASSAY_POOL_FILE": str(POOL), "ASSAY_SEARCH_LOG": str(log)}
    p = subprocess.Popen(
        [sys.executable, "-c", "from mitmproxy.tools.main import mitmdump; mitmdump()",
         "-s", str(ROOT / "backend" / "assay" / "proxy.py"), "--listen-host", "127.0.0.1",
         "--listen-port", str(port), "--set", f"confdir={tmp}"],
        env=env, cwd=ROOT / "backend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    ca = tmp / "mitmproxy-ca-cert.pem"
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            if ca.exists():
                break
        except OSError:
            pass
        assert p.poll() is None, "mitmdump exited at startup"
        time.sleep(0.1)
    else:
        p.kill()
        pytest.fail("proxy did not come up")
    with httpx.Client(proxy=f"http://127.0.0.1:{port}", verify=ssl.create_default_context(cafile=str(ca)), timeout=10) as c:
        c.log = log
        yield c
    p.kill()


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
    assert r.text == "real-local-body"
    assert len(log_lines(proxy)) == n
