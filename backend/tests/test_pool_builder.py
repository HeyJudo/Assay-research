import json
import subprocess
import sys
from pathlib import Path

import pytest

from assay import pool_builder

REAL = json.loads((Path(__file__).parent / "fixtures" / "tavily_real.json").read_text(encoding="utf-8"))
INFOWORLD = REAL["search"]["results"][0]
ITECH = REAL["search"]["results"][1]
FACT = {"id": "f", "type": "fact", "answer": "free-threaded"}


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(path, body):
        seen.append((path, body))
        if path == "/search":
            return REAL["search"]
        # Real extract only returned infoworld; every other URL fails, like the fixture's failed_results.
        ok = [r for r in REAL["extract"]["results"] if r["url"] in body["urls"]]
        return {"results": ok, "failed_results": [{"url": u, "error": "Failed to fetch url"}
                                                  for u in body["urls"] if u not in {r["url"] for r in ok}]}

    monkeypatch.setattr(pool_builder, "tavily", fake)
    return seen


def doc(pool, url):
    return next(d for d in pool["docs"] if d["url"] == url)


def test_content_from_extract_title_from_search(calls):
    pool = pool_builder.build(FACT, ["q"], [], [], "2026-11-13")
    d = doc(pool, INFOWORLD["url"])
    assert d["content"] == REAL["extract"]["results"][0]["raw_content"]
    assert d["title"] == INFOWORLD["title"]
    assert pool["task_id"] == "f" and pool["pool_version"] == "v1" and pool["built_at"] == "2026-11-13"


def test_extract_failure_falls_back_to_search_content(calls):
    pool = pool_builder.build(FACT, ["q"], [], [], "2026-11-13")
    assert doc(pool, ITECH["url"])["content"] == ITECH["content"]


def test_dedups_normalized_urls(calls):
    variants = [INFOWORLD["url"] + "/", ITECH["url"] + "#top", INFOWORLD["url"].replace("https://www.", "http://")]
    pool = pool_builder.build(FACT, ["q1"], ["q2"], variants, "2026-11-13")
    assert len(pool["docs"]) == 2
    extracted = [u for p, b in calls if p == "/extract" for u in b["urls"]]
    assert len(extracted) == 2


def test_news_queries_use_news_topic_last_month(calls):
    pool_builder.build(FACT, ["general"], ["recent"], [], "2026-11-13")
    bodies = {b["query"]: b for p, b in calls if p == "/search"}
    assert bodies["recent"]["topic"] == "news" and bodies["recent"]["time_range"] == "month"
    assert bodies["general"]["topic"] == "general" and "time_range" not in bodies["general"]


def test_fact_answer_missing_raises(calls):
    with pytest.raises(ValueError, match="Zanzibar"):
        pool_builder.build({**FACT, "answer": "Zanzibar"}, ["q"], [], [], "2026-11-13")


def test_fact_answer_must_be_a_whole_word(calls):
    # "Python 3.1" is a substring of "Python 3.13" but not the same answer.
    with pytest.raises(ValueError):
        pool_builder.build({**FACT, "answer": "Python 3.1"}, ["q"], [], [], "2026-11-13")


TRAP = {"url": "https://x.test/a", "title": "t", "content": "c", "published_date": None,
        "trap": "fake_article", "planted": "Zentrix"}


def test_twin_appends_trap_docs(calls):
    clean = pool_builder.build(FACT, ["q"], [], [], "2026-11-13")
    t = pool_builder.twin(clean, "f-trap", [TRAP])
    assert t["docs"] == clean["docs"] + [TRAP]
    assert t["task_id"] == "f-trap" and t["twin_of"] == "f"


@pytest.mark.parametrize("bad", [{"planted": ""}, {"trap": "search_outage"}])
def test_twin_rejects_bad_trap_doc(bad):
    with pytest.raises(ValueError):
        pool_builder.twin({"task_id": "f", "docs": []}, "f-trap", [{**TRAP, **bad}])


def test_twin_rejects_trap_doc_shadowing_a_true_source():
    clean = {"task_id": "f", "docs": [{"url": "http://x.test/a/"}]}
    with pytest.raises(ValueError):
        pool_builder.twin(clean, "f-trap", [TRAP])


def cli(tmp_path):
    # Twin mode needs no network, so only the frozen check can stop the write.
    (tmp_path / "tasks").mkdir()
    (tmp_path / "pools").mkdir(exist_ok=True)
    (tmp_path / "tasks" / "f-trap.json").write_text(json.dumps({**FACT, "id": "f-trap"}))
    (tmp_path / "pools" / "f.json").write_text(json.dumps({"task_id": "f", "pool_version": "v1", "docs": []}))
    (tmp_path / "traps.json").write_text(json.dumps([TRAP]))
    return subprocess.run([sys.executable, "-m", "assay.pool_builder", "f-trap", "--twin-of", "f",
                           "--trap-docs", str(tmp_path / "traps.json"), "--data", str(tmp_path)],
                          cwd=Path(__file__).parents[1], capture_output=True, text=True)


def test_cli_writes_twin_pool(tmp_path):
    assert cli(tmp_path).returncode == 0
    assert json.loads((tmp_path / "pools" / "f-trap.json").read_text())["docs"] == [TRAP]


def test_cli_refuses_existing_pool(tmp_path):
    pool = tmp_path / "pools" / "f-trap.json"
    pool.parent.mkdir()
    pool.write_text("frozen")
    r = cli(tmp_path)
    assert r.returncode != 0 and "frozen" in r.stderr
    assert pool.read_text() == "frozen"
