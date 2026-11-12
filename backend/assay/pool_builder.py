"""Builds a task's frozen pool from live Tavily (search + extract), once (PRD §6, §8).

Run from backend/ with TAVILY_API_KEY set:
    uv run python -m assay.pool_builder <task_id> [--query Q]... [--news Q]... [--url U]...
    uv run python -m assay.pool_builder <twin_id> --twin-of <clean_id> --trap-docs <file.json>

Reads data/tasks/<id>.json, writes data/pools/<id>.json in the format proxy.py reads. An existing pool is
never overwritten: pools are frozen. The pool records its own build inputs (queries, urls, built_at).
A twin pool is the clean pool's docs plus hand-written trap docs, each with "trap" and "planted"
(the string whose presence in an agent's output means trap_fell).
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
MAX_CHARS = 30_000  # ponytail: caps judge cost per cited doc; raise if answers sit deep in long pages
CONTENT_TRAPS = {"fake_article", "hidden_instruction"}


def key(url):
    """Dedup key: one page reached over http/https or with/without www. counts once."""
    # ponytail: query strings stay (youtube ?v=), so tracking params like ?op=1 still duplicate a page
    return re.sub(r"^https?://(www\.)?", "", url.split("#")[0]).rstrip("/")


def has(text, s):
    """s appears in text as a whole word (case-insensitive), so "3.1" does not match inside "3.13"."""
    return re.search(rf"(?<!\w){re.escape(s)}(?!\w)", text, re.I) is not None


def tavily(path: str, body: dict) -> dict:
    req = urllib.request.Request(f"https://api.tavily.com{path}", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}",
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def build(task: dict, queries: list[str], news: list[str], urls: list[str], built_at: str) -> dict:
    found = {}  # key(url) -> search result (first one wins)
    searches = [{"query": q, "topic": "general"} for q in queries] + \
               [{"query": q, "topic": "news", "time_range": "month"} for q in news]
    for body in searches:
        for r in tavily("/search", {**body, "max_results": 5})["results"]:
            found.setdefault(key(r["url"]), r)
    for u in urls:
        found.setdefault(key(u), {"url": u})
    extracted = {}
    keys = list(found)
    for i in range(0, len(keys), 20):  # Tavily extract takes at most 20 URLs per call
        for r in tavily("/extract", {"urls": [found[k]["url"] for k in keys[i:i + 20]]})["results"]:
            extracted[key(r["url"])] = r
    docs = []
    for k, s in found.items():
        e = extracted.get(k, {})
        content = e.get("raw_content") or s.get("content")
        if not content:
            continue  # a --url that failed to extract has nothing to serve
        docs.append({"url": s["url"], "title": s.get("title") or e.get("title") or s["url"],
                     "content": content[:MAX_CHARS], "published_date": s.get("published_date")})
    if task["type"] == "fact" and not any(has(d["content"], task["answer"]) for d in docs):
        raise ValueError(f"answer {task['answer']!r} is in no pool doc")
    return {"task_id": task["id"], "pool_version": "v1", "built_at": built_at,
            "queries": [s["query"] for s in searches], "urls": urls, "docs": docs}


def twin(clean_pool: dict, twin_id: str, trap_docs: list[dict]) -> dict:
    true_urls = {key(d["url"]) for d in clean_pool["docs"]}
    for d in trap_docs:
        if d.get("trap") not in CONTENT_TRAPS or not d.get("planted"):
            raise ValueError(f"trap doc {d.get('url')} needs trap in {sorted(CONTENT_TRAPS)} and a planted string")
        if key(d["url"]) in true_urls:
            raise ValueError(f"trap doc {d['url']} would shadow a true source")
    return {**clean_pool, "task_id": twin_id, "twin_of": clean_pool["task_id"],
            "docs": clean_pool["docs"] + trap_docs}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("task_id")
    p.add_argument("--query", action="append", default=[])
    p.add_argument("--news", action="append", default=[])
    p.add_argument("--url", action="append", default=[])
    p.add_argument("--twin-of")
    p.add_argument("--trap-docs")
    p.add_argument("--data", type=Path, default=DATA)
    a = p.parse_args()
    out = a.data / "pools" / f"{a.task_id}.json"
    if out.exists():
        sys.exit(f"{out} exists: pools are frozen, delete it by hand to rebuild")
    task = json.loads((a.data / "tasks" / f"{a.task_id}.json").read_text(encoding="utf-8"))
    if a.twin_of:
        clean = json.loads((a.data / "pools" / f"{a.twin_of}.json").read_text(encoding="utf-8"))
        pool = twin(clean, task["id"], json.loads(Path(a.trap_docs).read_text(encoding="utf-8")))
    else:
        pool = build(task, a.query, a.news, a.url, date.today().isoformat())
    out.write_text(json.dumps(pool, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{out}: {len(pool['docs'])} docs")


if __name__ == "__main__":
    main()
