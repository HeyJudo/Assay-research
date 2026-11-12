"""Pins the frozen benchmark suite (PRD §3, §8, §9): 12 tasks + 4 trapped twins, one pool each."""
import json
from collections import Counter
from pathlib import Path

from assay.models import Task

DATA = Path(__file__).resolve().parents[2] / "data"
TASKS = {t.id: t for t in (Task.model_validate_json(p.read_text(encoding="utf-8"))
                           for p in (DATA / "tasks").glob("*.json"))}
POOLS = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in (DATA / "pools").glob("*.json")}
TWINS = {t.trap_twin: t for t in TASKS.values() if t.trap_twin}  # twin id -> clean task


def traps(pool):
    return [d for d in pool["docs"] if d.get("trap")]


def test_suite_counts():
    clean = [t for t in TASKS.values() if t.id not in TWINS]
    assert Counter(t.type for t in clean) == {"fact": 4, "briefing": 5, "unanswerable": 3}
    assert Counter(TASKS[i].type for i in TWINS) == {"fact": 2, "briefing": 2}


def test_task_ids_match_files_and_every_task_has_its_pool():
    for p in (DATA / "tasks").glob("*.json"):
        assert json.loads(p.read_text(encoding="utf-8"))["id"] == p.stem
    assert set(POOLS) == set(TASKS)
    for tid, pool in POOLS.items():
        assert pool["task_id"] == tid and pool["pool_version"] == "v1" and pool["docs"]
        assert len({d["url"].split("#")[0].rstrip("/") for d in pool["docs"]}) == len(pool["docs"])


def test_answers_match_type():
    for t in TASKS.values():
        assert (t.answer is None) == (t.type == "briefing")
        assert (t.answer == "NOT_FOUND") == (t.type == "unanswerable")
        assert t.as_of_date == "2026-11-13"


def test_fact_answers_are_in_pool():
    for t in TASKS.values():
        if t.type == "fact":
            assert any(t.answer.casefold() in d["content"].casefold() for d in POOLS[t.id]["docs"]), t.id


def test_twins_mirror_their_clean_task():
    for twin_id, clean in TWINS.items():
        twin = TASKS[twin_id]
        assert twin.trap_twin is None
        assert (twin.type, twin.prompt, twin.answer, twin.as_of_date) == \
               (clean.type, clean.prompt, clean.answer, clean.as_of_date)
        pool = POOLS[twin_id]
        assert pool["twin_of"] == clean.id
        assert pool["docs"][:len(POOLS[clean.id]["docs"])] == POOLS[clean.id]["docs"]  # true sources stay


def test_each_twin_has_one_planted_trap_absent_from_its_clean_pool():
    assert Counter(traps(POOLS[i])[0]["trap"] for i in TWINS) == {"fake_article": 2, "hidden_instruction": 2}
    for twin_id, clean in TWINS.items():
        [trap] = traps(POOLS[twin_id])
        assert trap["planted"] in trap["content"]
        assert not any(trap["planted"] in d["content"] for d in POOLS[clean.id]["docs"])


def test_clean_pools_have_no_traps():
    for tid, pool in POOLS.items():
        if tid not in TWINS:
            assert not traps(pool), tid
