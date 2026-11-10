"""Assay search proxy: a mitmproxy add-on that freezes the web to a task's pool.

Run from backend/ (8080 is Bifrost, so dev uses 8081):
    ASSAY_POOL_FILE=../data/practice/pools/practice-python-313.json \
    ASSAY_SEARCH_LOG=search.jsonl \
    uv run mitmdump -s assay/proxy.py --listen-port 8081         --mode upstream:http://127.0.0.1:9 --set connection_strategy=lazy --set rawtcp=false

The upstream mode points at a dead port on purpose: mitmproxy hot-reloads scripts, and a failed
reload unloads this add-on. Without the dead upstream every request would then reach the real
internet. With it they get 502. The add-on refuses to run without that mode.

Pool file, data/pools/<task_id>.json (practice pools: data/practice/pools/):
    {"task_id": str, "pool_version": str,
     "docs": [{"url", "title", "content", "published_date"}]}

Behavior (PRD section 6):
- No pass-through: localhost is 404 like any non-pool URL. The runner sets NO_PROXY=localhost,127.0.0.1.
- api.tavily.com POST /search and /extract are answered from the pool.
- Any other URL in the pool is served as minimal HTML. Everything else is 404.
- One JSONL line per search / extract / fetch is appended to ASSAY_SEARCH_LOG.
"""
import html
import json
import os
import re
import time
import traceback
import uuid

from mitmproxy import ctx, http

# ponytail: port 9 is assumed dead (discard service off). Pick another if something listens there.
UPSTREAM = ["upstream:http://127.0.0.1:9"]


def norm(url):
    return url.split("#")[0].rstrip("/")


def snippet(text, n=500):
    # ponytail: query-agnostic prefix, real Tavily picks the relevant chunk
    return text if len(text) <= n else text[:n].rsplit(None, 1)[0]


def words(text):
    return set(re.findall(r"\w+", text.lower()))


class BadRequest(Exception):
    pass


def parse(flow):
    try:
        body = flow.request.json()
    except ValueError:
        raise BadRequest("Invalid JSON body")
    if not isinstance(body, dict):
        raise BadRequest("Body must be a JSON object")
    return body


class Proxy:
    def __init__(self):
        # KeyError on a missing env var: fail loudly at startup.
        with open(os.environ["ASSAY_POOL_FILE"], encoding="utf-8") as f:
            self.docs = json.load(f)["docs"]
        self.by_url = {norm(d["url"]): d for d in self.docs}
        self.log = open(os.environ["ASSAY_SEARCH_LOG"], "a", encoding="utf-8")

    def running(self):
        if list(ctx.options.mode) != UPSTREAM:
            ctx.log.error(f"assay proxy must run with --mode {UPSTREAM[0]}, refusing to start")
            ctx.master.shutdown()
            return
        # Default "eager" would connect upstream on CONNECT and break made-up pool hosts.
        ctx.options.connection_strategy = "lazy"
        # Non-HTTP bytes over CONNECT would otherwise be relayed raw to the real host
        # (tcp_start cannot stop it). With rawtcp off they hit the HTTP parser and fail.
        ctx.options.rawtcp = False

    def write(self, kind, results, **key):
        self.log.write(json.dumps({"t": time.time(), "kind": kind, **key, "results": results}) + "\n")
        self.log.flush()

    def request(self, flow: http.HTTPFlow):
        # mitmproxy swallows hook exceptions and forwards the flow upstream, so fail closed.
        try:
            self.route(flow)
        except BadRequest as e:
            flow.response = http.Response.make(
                400, json.dumps({"detail": {"error": str(e)}}), {"Content-Type": "application/json"})
        except Exception:
            ctx.log.error(traceback.format_exc())
            flow.response = http.Response.make(500, b"assay proxy error")

    def route(self, flow):
        req = flow.request
        host = req.host.lower()  # URL host, not the spoofable Host header
        path = req.path.split("?")[0]
        if host == "api.tavily.com":
            if req.method == "POST" and path == "/search":
                return self.search(flow)
            if req.method == "POST" and path == "/extract":
                return self.extract(flow)
            flow.response = http.Response.make(404, b"not found")
            return
        self.fetch(flow)

    def search(self, flow):
        t0 = time.time()
        body = parse(flow)
        query, n = body.get("query"), body.get("max_results")
        n = 5 if n is None else n  # null means default, like real Tavily
        if not isinstance(query, str) or not query.strip():
            raise BadRequest("Query is missing or empty")
        if type(n) is not int:
            raise BadRequest("max_results must be an integer")
        n = max(0, min(n, 20))
        q = words(query)
        # ponytail: naive keyword overlap, upgrade to BM25 if ranking quality matters
        scored = [(len(q & words(d["title"] + " " + d["content"])), d) for d in self.docs]
        hits = sorted((s for s in scored if s[0] > 0), key=lambda s: -s[0])[:n]
        # TRAPS (later task): reorder/inject results or return 503 here.
        raw = body.get("include_raw_content")
        rid = str(uuid.uuid4())
        results = []
        for i, (sc, d) in enumerate(hits):
            r = {"url": d["url"], "title": d["title"], "content": snippet(d["content"]), "score": sc / len(q),
                 "raw_content": d["content"] if raw else None, "id": f"{rid[:6]}-{i:02d}"}
            if body.get("topic") == "news":  # real Tavily only returns dates for news
                r["published_date"] = d.get("published_date")
            results.append(r)
        self.write("search", [r["url"] for r in results], query=query)
        flow.response = http.Response.make(
            200,
            json.dumps({"query": query, "follow_up_questions": None, "answer": None, "images": [],
                        "results": results, "response_time": round(time.time() - t0, 3),
                        "request_id": rid}),
            {"Content-Type": "application/json"},
        )

    def extract(self, flow):
        t0 = time.time()
        urls = parse(flow).get("urls")
        urls = [urls] if isinstance(urls, str) else urls
        if not urls or not isinstance(urls, list) or not all(isinstance(u, str) and u for u in urls):
            raise BadRequest("urls must be a non-empty string or list of strings")
        found = [self.by_url[norm(u)] for u in urls if norm(u) in self.by_url]
        failed = [u for u in urls if norm(u) not in self.by_url]
        self.write("extract", [d["url"] for d in found], urls=urls)
        flow.response = http.Response.make(
            200,
            json.dumps({
                "results": [{"url": d["url"], "title": d["title"], "raw_content": d["content"], "images": []}
                            for d in found],
                "failed_results": [{"url": u, "error": "Failed to fetch url"} for u in failed],
                "response_time": round(time.time() - t0, 3),
                "request_id": str(uuid.uuid4()),
            }),
            {"Content-Type": "application/json"},
        )

    def fetch(self, flow):
        url = flow.request.url
        d = self.by_url.get(norm(url))
        self.write("fetch", [d["url"]] if d else [], url=url)
        if not d:
            flow.response = http.Response.make(404, b"not in pool")
            return
        paras = "".join(f"<p>{html.escape(p)}</p>" for p in re.split(r"\n\s*\n", d["content"]))
        page = f"<!doctype html><html><head><title>{html.escape(d['title'])}</title></head><body>{paras}</body></html>"
        flow.response = http.Response.make(200, page, {"Content-Type": "text/html; charset=utf-8"})


addons = [Proxy()]
