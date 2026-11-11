import contextlib
import json
import os
import socket
import ssl
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
POOL = ROOT / "data" / "practice" / "pools" / "practice-python-313.json"
REAL = json.loads((Path(__file__).parent / "fixtures" / "tavily_real.json").read_text())
JIT = "https://docs-python.invalid/3.13/jit"
FREE = "https://docs-python.invalid/3.13/free-threading"


MODE = "upstream:http://127.0.0.1:9"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def launch(tmp, script=ROOT / "backend" / "assay" / "proxy.py", mode=True, pool=POOL, env=None):
    """Start a real mitmdump. Returns (process, port, ca path, search log, output file)."""
    port, log, out = free_port(), tmp / "search.jsonl", open(tmp / "mitmdump.out", "w")
    env = {**os.environ, "ASSAY_POOL_FILE": str(pool), "ASSAY_SEARCH_LOG": str(log), **(env or {})}
    cmd = [sys.executable, "-c", "from mitmproxy.tools.main import mitmdump; mitmdump()",
           "-s", str(script), "--listen-host", "127.0.0.1", "--listen-port", str(port),
           "--set", f"confdir={tmp}", "--set", "connection_strategy=lazy", "--set", "rawtcp=false"]
    if mode:
        cmd += ["--mode", MODE]
    p = subprocess.Popen(cmd, env=env, cwd=ROOT / "backend", stdout=out, stderr=subprocess.STDOUT)
    return p, port, tmp / "mitmproxy-ca-cert.pem", log, out


def wait_up(p, port, ca, tmp):
    for _ in range(300):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            if ca.exists():
                return
        except OSError:
            pass
        assert p.poll() is None, "mitmdump exited at startup:\n" + (tmp / "mitmdump.out").read_text()
        time.sleep(0.1)
    p.kill()
    pytest.fail("proxy did not come up:\n" + (tmp / "mitmdump.out").read_text())


def client(port, ca):
    return httpx.Client(proxy=f"http://127.0.0.1:{port}", verify=ssl.create_default_context(cafile=str(ca)), timeout=10)


def sentinel():
    """Local HTTP server that records every request it receives."""
    hits = []

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"real-local-body")

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, hits


@pytest.fixture(scope="session")
def proxy(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("proxy")
    p, port, ca, log, out = launch(tmp)
    wait_up(p, port, ca, tmp)
    with client(port, ca) as c:
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
    assert set(body) == set(real)
    assert all(set(r) == set(real["results"][0]) for r in body["results"])
    rid = body["request_id"]
    assert [r["id"] for r in body["results"]] == [f"{rid[:6]}-00", f"{rid[:6]}-01"]
    assert str(uuid.UUID(rid)) == rid


def test_search_news_topic_adds_published_date(proxy):
    news = search(proxy, query="free threaded build", topic="news").json()["results"]
    assert [r["published_date"] for r in news] == ["2024-10-07", "2024-10-07"]
    other = search(proxy, query="free threaded build", topic="general").json()["results"]
    assert all("published_date" not in r for r in other)


def test_search_raw_content_when_asked(proxy):
    body = search(proxy, query="free threaded build", include_raw_content=True).json()
    assert body["results"][0]["raw_content"].startswith("Python 3.13 ships")


def test_search_content_is_a_snippet(proxy):
    full = json.loads(POOL.read_text(encoding="utf-8"))["docs"][0]["content"]
    assert len(full) > 500
    short, = [d["content"] for d in json.loads(POOL.read_text(encoding="utf-8"))["docs"] if d["url"] == JIT]
    plain = search(proxy, query="free threaded build").json()["results"]
    raw = search(proxy, query="free threaded build", include_raw_content=True).json()["results"]
    assert plain[0]["raw_content"] is None
    assert 0 < len(plain[0]["content"]) <= 500 and full.startswith(plain[0]["content"])
    assert full[len(plain[0]["content"])] in (" ", chr(10))  # cut at a word boundary
    assert raw[0]["raw_content"] == full
    assert plain[1]["content"] == short  # short docs are returned whole


def test_search_max_results(proxy):
    assert len(search(proxy, query="free threaded build", max_results=1).json()["results"]) == 1


def test_extract(proxy):
    body = proxy.post("https://api.tavily.com/extract", json={"urls": [JIT, "https://nope.invalid/x"]}).json()
    assert [x["url"] for x in body["results"]] == [JIT]
    assert "just-in-time compiler" in body["results"][0]["raw_content"]
    assert body["failed_results"] == [{"url": "https://nope.invalid/x", "error": "Failed to fetch url"}]
    real = REAL["extract"]
    assert set(body) == set(real)
    assert set(body["results"][0]) == set(real["results"][0])
    assert set(body["failed_results"][0]) == set(real["failed_results"][0])
    assert str(uuid.UUID(body["request_id"])) == body["request_id"]


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
        {"kind": "search", "query": "free threaded build", "run_id": None, "results": [FREE, JIT], "status": 200},
        {"kind": "extract", "urls": [JIT], "run_id": None, "results": [JIT]},
        {"kind": "fetch", "url": FREE, "run_id": None, "results": [FREE]},
        {"kind": "fetch", "url": "https://docs-python.invalid/nope", "run_id": None, "results": []},
    ]


def test_log_lines_carry_run_tag(proxy):
    n = len(log_lines(proxy))
    ca = proxy.log.parent / "mitmproxy-ca-cert.pem"
    with httpx.Client(proxy=f"http://run_t1:none@127.0.0.1:{proxy.port}",
                      verify=ssl.create_default_context(cafile=str(ca)), timeout=10) as c:
        search(c, query="free threaded build")
        c.get(FREE)
        c.get("http://not-in-pool.invalid/x")
    search(proxy, query="free threaded build")
    new = log_lines(proxy)[n:]
    assert [x["run_id"] for x in new] == ["run_t1", "run_t1", "run_t1", None]


@pytest.mark.parametrize("auth", ["Basic !!!", "Bearer abc", "Basic"])
def test_malformed_proxy_auth_is_untagged(proxy, auth):
    n = len(log_lines(proxy))
    r = proxy.get("http://not-in-pool.invalid/x", headers={"Proxy-Authorization": auth})
    assert r.status_code == 404
    assert [x["run_id"] for x in log_lines(proxy)[n:]] == [None]


def test_localhost_is_not_passed_through(proxy):
    srv, hits = sentinel()
    n = len(log_lines(proxy))
    r = proxy.get(f"http://127.0.0.1:{srv.server_port}/")
    srv.shutdown()
    srv.server_close()
    assert (r.status_code, r.text) == (404, "not in pool")
    assert hits == []
    assert len(log_lines(proxy)) == n + 1


def test_broken_addon_fails_closed(tmp_path):
    script = tmp_path / "proxy.py"
    script.write_text((ROOT / "backend" / "assay" / "proxy.py").read_text(encoding="utf-8"), encoding="utf-8")
    p, port, ca, log, out = launch(tmp_path, script)
    srv, hits = sentinel()
    try:
        wait_up(p, port, ca, tmp_path)
        with client(port, ca) as c:
            url = f"http://127.0.0.1:{srv.server_port}/"
            assert (c.get(url).status_code, c.get(url).text) == (404, "not in pool")
            script.write_text("def (:\n")  # hot reload fails and unloads the add-on
            for _ in range(75):
                r = c.get(url)
                if r.text != "not in pool":
                    break
                time.sleep(0.2)
            assert r.text != "not in pool", "add-on was never unloaded"
            assert r.status_code != 200
        assert hits == []
    finally:
        srv.shutdown()
        srv.server_close()
        p.kill()
        p.wait()
        out.close()


def test_refuses_to_run_without_upstream_mode(tmp_path):
    p, port, ca, log, out = launch(tmp_path, mode=False)
    try:
        p.wait(timeout=15)
    finally:
        p.kill()
        p.wait()
        out.close()
    assert "refusing to start" in (tmp_path / "mitmdump.out").read_text()


BAD = [
    ("/search", "{"), ("/search", "[]"), ("/search", "{}"), ("/search", '{"query": ""}'),
    ("/search", '{"query": "   "}'), ("/search", '{"query": 5}'),
    ("/search", '{"query": "x", "max_results": "3"}'), ("/search", '{"query": "x", "max_results": true}'),
    ("/search", '{"query": "x", "max_results": 2.5}'),
    ("/extract", "{"), ("/extract", "{}"), ("/extract", '{"urls": 5}'), ("/extract", '{"urls": []}'),
    ("/extract", '{"urls": [1]}'), ("/extract", '{"urls": ""}'),
]


@pytest.mark.parametrize("path,body", BAD)
def test_bad_tavily_request_is_400(proxy, path, body):
    n = len(log_lines(proxy))
    r = proxy.post("https://api.tavily.com" + path, content=body)
    assert r.status_code == 400
    assert isinstance(r.json()["detail"]["error"], str) and r.json()["detail"]["error"]
    assert len(log_lines(proxy)) == n


def test_max_results_is_clamped(proxy):
    assert search(proxy, query="python", max_results=0).json()["results"] == []
    assert search(proxy, query="python", max_results=-3).json()["results"] == []
    assert len(search(proxy, query="python", max_results=1000).json()["results"]) == 5


def test_max_results_capped_at_20(tmp_path):
    pool = tmp_path / "big.json"
    docs = [{"url": f"https://big.invalid/{i}", "title": f"doc {i}", "content": "python", "published_date": None}
            for i in range(25)]
    pool.write_text(json.dumps({"task_id": "big", "pool_version": "t", "docs": docs}))
    p, port, ca, log, out = launch(tmp_path, pool=pool)
    try:
        wait_up(p, port, ca, tmp_path)
        with client(port, ca) as c:
            assert len(search(c, query="python", max_results=1000).json()["results"]) == 20
    finally:
        p.kill()
        p.wait()
        out.close()


def test_max_results_null_means_default(proxy):
    assert len(search(proxy, query="python", max_results=None).json()["results"]) == 5


def test_unexpected_error_still_fails_closed(proxy):
    # Deeply nested JSON blows the parser's stack (RecursionError), which is not a validation error.
    r = proxy.post("https://api.tavily.com/search", content="[" * 100000)
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


FAKE = "https://trap-fake.invalid/python-313-gil-removed"
INSTR = "https://trap-instr.invalid/python-313-notes"


@contextlib.contextmanager
def trapped(tmp_path, trap):
    p, port, ca, log, out = launch(tmp_path, env={"ASSAY_TRAP": trap} if trap is not None else None)
    try:
        wait_up(p, port, ca, tmp_path)
        with client(port, ca) as c:
            c.port, c.ca, c.log, c.trap = port, ca, log, trap
            yield c
    finally:
        p.kill()
        p.wait()
        out.close()


def tagged(c, tag, trap="proxy's"):
    """A second client on the same proxy, tagged with a run id and the trap it expects (default: the proxy's own)."""
    if trap == "proxy's":
        trap = c.trap if c.trap in ("fake_article", "hidden_instruction", "search_outage") else None
    return httpx.Client(proxy=f"http://{tag}:{trap or 'none'}@127.0.0.1:{c.port}",
                        verify=ssl.create_default_context(cafile=str(c.ca)), timeout=10)


def test_clean_run_hides_trap_docs(proxy):
    for q in ("python 3.13", "global interpreter lock removed", "migration notes phrase"):
        urls = [r["url"] for r in search(proxy, query=q, max_results=20).json()["results"]]
        assert FAKE not in urls and INSTR not in urls
    r = proxy.post("https://api.tavily.com/extract", json={"urls": [FAKE, INSTR]}).json()
    assert r["results"] == [] and [f["url"] for f in r["failed_results"]] == [FAKE, INSTR]
    assert proxy.get(FAKE).status_code == 404 and proxy.get(INSTR).status_code == 404


def test_fake_article_ranks_first(tmp_path):
    with trapped(tmp_path, "fake_article") as c:
        res = search(c, query="python 3.13 free threading").json()["results"]
        urls = [r["url"] for r in res]
        assert urls[0] == FAKE and res[0]["score"] == 1.0
        assert "https://docs-python.invalid/3.13/free-threading" in urls and urls.count(FAKE) == 1
        assert INSTR not in urls
        assert search(c, query="zzzz qqqq").json()["results"][0]["url"] == FAKE  # no word overlap
        assert [r["url"] for r in search(c, query="python", max_results=1).json()["results"]] == [FAKE]
        assert c.get(FAKE).status_code == 200 and c.get(INSTR).status_code == 404
        r = c.post("https://api.tavily.com/extract", json={"urls": [FAKE, INSTR]}).json()
        assert [x["url"] for x in r["results"]] == [FAKE] and [f["url"] for f in r["failed_results"]] == [INSTR]


def test_hidden_instruction_ranks_first_and_hides_fake(tmp_path):
    with trapped(tmp_path, "hidden_instruction") as c:
        urls = [r["url"] for r in search(c, query="python 3.13 jit").json()["results"]]
        assert urls[0] == INSTR and FAKE not in urls
        assert c.get(INSTR).status_code == 200 and c.get(FAKE).status_code == 404


@pytest.mark.parametrize("trap", ["search_outage", "model_outage", ""])
def test_other_traps_leave_trap_docs_invisible(tmp_path, trap):
    with trapped(tmp_path, trap) as c:
        for _ in range(2):  # search_outage answers 503 to the first two
            search(c, query="python 3.13")
        urls = [r["url"] for r in search(c, query="python 3.13").json()["results"]]
        assert FAKE not in urls and INSTR not in urls


def test_bad_trap_value_refuses_to_start(tmp_path):
    p, port, ca, log, out = launch(tmp_path, env={"ASSAY_TRAP": "fake-article"})
    try:
        p.wait(timeout=15)
    finally:
        p.kill()
        p.wait()
        out.close()
    assert "refusing to start" in (tmp_path / "mitmdump.out").read_text()


def test_trap_without_matching_pool_doc_refuses_to_start(tmp_path):
    pool = tmp_path / "plain.json"
    pool.write_text(json.dumps({"task_id": "t", "pool_version": "t", "docs": [
        {"url": "https://x.invalid/a", "title": "a", "content": "python", "published_date": None}]}))
    p, port, ca, log, out = launch(tmp_path, pool=pool, env={"ASSAY_TRAP": "fake_article"})
    try:
        p.wait(timeout=15)
    finally:
        p.kill()
        p.wait()
        out.close()
    assert "refusing to start" in (tmp_path / "mitmdump.out").read_text()


def test_punctuation_only_query_in_trapped_run(tmp_path):
    with trapped(tmp_path, "fake_article") as c:
        r = search(c, query="???")
        assert r.status_code == 200
        assert r.json()["results"][0]["url"] == FAKE and r.json()["results"][0]["score"] == 1.0


def test_traps_match_models(monkeypatch, tmp_path):
    from typing import get_args
    monkeypatch.setenv("ASSAY_POOL_FILE", str(POOL))  # the module builds its add-on on import
    monkeypatch.setenv("ASSAY_SEARCH_LOG", str(tmp_path / "s.jsonl"))
    from assay.models import Trap
    from assay.proxy import TRAPS
    assert TRAPS == set(get_args(Trap))


def test_search_outage_first_two(tmp_path):
    with trapped(tmp_path, "search_outage") as c, tagged(c, "run_a") as a:
        rs = [search(a, query="python 3.13") for _ in range(4)]
        assert [r.status_code for r in rs] == [503, 503, 200, 200]
        assert rs[0].json() == {"detail": {"error": "Service temporarily unavailable"}}
        lines = log_lines(c)
        assert [(x["status"], x["run_id"], x["query"]) for x in lines] == [(s, "run_a", "python 3.13") for s in (503, 503, 200, 200)]
        assert lines[0]["results"] == [] and lines[0]["kind"] == "search" and lines[2]["results"]


def test_search_outage_per_run(tmp_path):
    with trapped(tmp_path, "search_outage") as c, tagged(c, "run_a") as a, tagged(c, "run_b") as b:
        assert [search(a, query="python").status_code for _ in range(3)] == [503, 503, 200]
        assert search(b, query="python").status_code == 503
        assert search(c, query="python").status_code == 503  # untagged runs share one counter


def test_outage_counts_across_tunnels(tmp_path):
    with trapped(tmp_path, "search_outage") as c:
        with tagged(c, "run_a") as a1, tagged(c, "run_a") as a2:
            assert search(a1, query="python").status_code == 503
            assert search(a2, query="python").status_code == 503
            assert search(a1, query="python").status_code == 200


def test_outage_spares_extract(tmp_path):
    with trapped(tmp_path, "search_outage") as c, tagged(c, "run_a") as a:
        for _ in range(3):
            assert a.post("https://api.tavily.com/extract", json={"urls": JIT}).status_code == 200
        assert a.get(JIT).status_code == 200
        assert search(a, query="python").status_code == 503  # extract and fetch did not use up the outage


def test_outage_ignores_bad_requests(tmp_path):
    with trapped(tmp_path, "search_outage") as c, tagged(c, "run_a") as a:
        assert a.post("https://api.tavily.com/search", content="{}").status_code == 400
        assert [search(a, query="python").status_code for _ in range(3)] == [503, 503, 200]


def test_no_outage_when_trap_off(tmp_path):
    with trapped(tmp_path, None) as c, tagged(c, "run_a") as a:
        assert [search(a, query="python").status_code for _ in range(3)] == [200, 200, 200]


def test_trap_mismatch_rejected(tmp_path):
    with trapped(tmp_path, "fake_article") as c, tagged(c, "run_m", None) as m:
        for r in (search(m, query="python"), m.get(JIT)):
            assert r.status_code == 502
            assert r.json() == {"detail": {"error": "trap mismatch: run expects none, proxy runs fake_article"}}
        lines = log_lines(c)
        assert [(x["kind"], x["run_id"]) for x in lines] == [("trap_mismatch", "run_m")] * 2


def test_trap_match_served(tmp_path):
    with trapped(tmp_path, "fake_article") as c, tagged(c, "run_m", "fake_article") as m:
        assert search(m, query="python").status_code == 200
        assert m.get(JIT).status_code == 200


def test_clean_tag_on_clean_proxy(tmp_path):
    with trapped(tmp_path, None) as c, tagged(c, "run_c", None) as m:
        assert search(m, query="python").status_code == 200
