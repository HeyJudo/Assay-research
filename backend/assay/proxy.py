"""Assay search proxy: a mitmproxy add-on that freezes the web to a task's pool.

Run from backend/ (8080 is Bifrost, so dev uses 8081):
    ASSAY_POOL_FILE=../data/practice/pools/practice-python-313.json \
    ASSAY_SEARCH_LOG=search.jsonl \
    uv run mitmdump -s assay/proxy.py --listen-port 8081

Pool file, data/pools/<task_id>.json (practice pools: data/practice/pools/):
    {"task_id": str, "pool_version": str,
     "docs": [{"url", "title", "content", "published_date"}]}

Behavior (PRD section 6):
- localhost / 127.0.0.1 / ::1 pass through untouched (Bifrost).
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

from mitmproxy import ctx, http

LOCAL = {"localhost", "127.0.0.1", "::1"}


def norm(url):
    return url.split("#")[0].rstrip("/")


def words(text):
    return set(re.findall(r"\w+", text.lower()))


class Proxy:
    def __init__(self):
        # KeyError on a missing env var: fail loudly at startup.
        with open(os.environ["ASSAY_POOL_FILE"], encoding="utf-8") as f:
            self.docs = json.load(f)["docs"]
        self.by_url = {norm(d["url"]): d for d in self.docs}
        self.log = open(os.environ["ASSAY_SEARCH_LOG"], "a", encoding="utf-8")

    def running(self):
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
        except Exception:
            ctx.log.error(traceback.format_exc())
            flow.response = http.Response.make(500, b"assay proxy error")

    def route(self, flow):
        req = flow.request
        host = req.host.lower()  # URL host, not the spoofable Host header
        if host in LOCAL:
            return
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
        body = flow.request.json()
        query, n = body["query"], body.get("max_results", 5)
        q = words(query)
        # ponytail: naive keyword overlap, upgrade to BM25 if ranking quality matters
        scored = [(len(q & words(d["title"] + " " + d["content"])), d) for d in self.docs]
        hits = sorted((s for s in scored if s[0] > 0), key=lambda s: -s[0])[:n]
        # TRAPS (later task): reorder/inject results or return 503 here.
        raw = body.get("include_raw_content")
        results = [
            {"url": d["url"], "title": d["title"], "content": d["content"], "score": s / len(q),
             "raw_content": d["content"] if raw else None, "published_date": d.get("published_date")}
            for s, d in hits
        ]
        self.write("search", [r["url"] for r in results], query=query)
        flow.response = http.Response.make(
            200,
            json.dumps({"query": query, "follow_up_questions": None, "answer": None, "images": [],
                        "results": results, "response_time": round(time.time() - t0, 3)}),
            {"Content-Type": "application/json"},
        )

    def extract(self, flow):
        t0 = time.time()
        urls = flow.request.json()["urls"]
        urls = [urls] if isinstance(urls, str) else urls
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
