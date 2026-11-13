"""start_batch: real search proxy, real agent subprocesses, real SQLite. Only Bifrost is a local stand-in."""

import json
from pathlib import Path

import pytest
import test_outage as to

from assay import runner, store
from assay.models import EVENT_DATA

TASK_ID = "practice-python3-year"  # data/practice only (PRD §9)

# Searches through the batch proxy, sleeps so runs overlap, and reports what it saw.
PROBE = """#!/usr/bin/env python3
import json, os, time
import httpx
LLM_CALLS = 0
start = time.time()
with httpx.Client(timeout=10) as c:
    search = c.post("https://api.tavily.com/search", json={"query": "python 3.0 release"}).status_code
    llm = [c.post(os.environ["OPENAI_BASE_URL"] + "/chat/completions", json={},
                  headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"]}).status_code
           for _ in range(LLM_CALLS)]
time.sleep(1.5)
open(os.environ["ASSAY_OUTPUT"], "w").write(json.dumps(dict(
    key=os.environ["OPENAI_API_KEY"], search=search, llm=llm, start=start, end=time.time())))
"""


def agent(root: Path, name: str, body=PROBE):
    d = root / name
    d.mkdir()
    (d / "run").write_text(body)
    (d / "run").chmod(0o755)
    (d / "agent.json").write_text(json.dumps({"version": "0.1", "models": ["qwen3.8-27b"], "prompt_hash": "p"}))
    return d


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    monkeypatch.setattr(runner, "AGENTS_DIR", tmp_path / "agents")
    (tmp_path / "agents").mkdir()
    agent(tmp_path / "agents", "a")
    agent(tmp_path / "agents", "b")
    monkeypatch.setattr(runner, "BIFROST_LOG_DELAY_S", 0)
    srv, hits = to.sentinel()
    yield srv, hits
    srv.shutdown()


def never_judge(prompt):
    raise AssertionError("the judge must not be called")


def run(agent_ids, trap, srv, vks, judge=never_judge, task=None):
    events = []

    def emit(name, data):
        if name == "run_started":  # the running record is in SQLite before run_started goes out
            assert store.get(data.run_id).status == "running"
        events.append((name, data))

    t = runner.start_batch("b_test", agent_ids, task or runner.find_task(TASK_ID), trap, emit=emit,
                           bifrost_url=f"http://127.0.0.1:{srv.server_port}/v1", vks=vks, judge=judge)
    t.join(60)
    assert not t.is_alive()
    return events


def test_batch_runs_in_parallel_each_on_its_own_key(env):
    srv, _ = env
    vks = [f"sk-bf-slot{i}" for i in range(1, 7)]
    events = run(["a", "b"], None, srv, vks)

    for name, data in events:
        EVENT_DATA[name].model_validate(data.model_dump(), strict=True)
    names = [n for n, _ in events]
    assert names.count("run_started") == 6 and names.count("run_done") == 6
    assert names[-1] == "batch_done" and names.count("batch_done") == 1
    assert all(d.status == "done" for n, d in events if n == "run_done")

    recs = store.list_runs(batch_id="b_test")
    assert len(recs) == 6 and all(r.status == "done" for r in recs)
    assert {r.config.pool_version for r in recs} == {"practice-v1"}  # from the pool file
    out = {(r.agent_id, r.repeat): json.loads(r.output.text) for r in recs}
    # Slot n gets BIFROST_RUN_VK_n, agent-major: a#1..3 then b#1..3.
    assert [out[k]["key"] for k in sorted(out)] == vks
    assert all(o["search"] == 200 for o in out.values())  # the batch proxy serves the task's pool
    assert max(o["start"] for o in out.values()) < min(o["end"] for o in out.values())  # all 6 overlap


def test_model_outage_batch_goes_through_outage_proxy(env):
    srv, hits = env
    agent(runner.AGENTS_DIR, "c", PROBE.replace("LLM_CALLS = 0", "LLM_CALLS = 4"))
    events = run(["c"], "model_outage", srv, ["k1", "k2", "k3"])
    recs = store.list_runs(batch_id="b_test")
    assert len(recs) == 3 and {r.trap for r in recs} == {"model_outage"}
    assert all(r.status == "done" for r in recs), [r.steps for r in recs]
    assert [json.loads(r.output.text)["llm"] for r in recs] == [[503, 503, 503, 200]] * 3
    assert hits == ["/v1/chat/completions"] * 3
    assert events[-1][0] == "batch_done"


def test_batch_proxy_gets_the_trap(env):
    srv, _ = env
    run(["a"], "search_outage", srv, ["k1", "k2", "k3"])
    recs = store.list_runs(batch_id="b_test")
    assert [json.loads(r.output.text)["search"] for r in recs] == [503] * 3  # each run's first search (PRD §6)


def test_failed_runs_still_finish_the_batch(env):
    srv, _ = env
    agent(runner.AGENTS_DIR, "crash", "#!/usr/bin/env python3\nimport sys\nsys.exit(3)\n")
    events = run(["crash"], None, srv, ["k1", "k2", "k3"])
    assert [d.status for n, d in events if n == "run_done"] == ["error"] * 3
    steps = [d for n, d in events if n == "step"]
    assert len(steps) == 3 and all(s.step.kind == "error" for s in steps)
    assert events[-1][0] == "batch_done"
    assert srv.gets == []  # never graded, never fetched usage (never_judge would have raised)


def test_lookups(env, tmp_path):
    assert runner.find_agent("a")[0] == runner.AGENTS_DIR / "a"
    assert runner.find_agent("a")[1]["prompt_hash"] == "p"
    (runner.AGENTS_DIR / "norun").mkdir()
    (runner.AGENTS_DIR / "norun" / "agent.json").write_text("{}")
    for bad in ["../agents/a", "nope", "norun", ""]:
        assert runner.find_agent(bad) is None
    assert runner.find_task(TASK_ID).answer == "2008"
    assert runner.find_task("../tasks/x") is None
    assert json.loads(runner.find_pool(TASK_ID).read_text("utf-8"))["pool_version"] == "practice-v1"
    assert runner.find_pool("../practice/pools/" + TASK_ID) is None
    assert runner.find_pool("nope") is None


def test_start_batch_refuses_bad_setup(env):
    srv, _ = env
    task = runner.find_task(TASK_ID)
    kw = dict(emit=lambda *a: None, bifrost_url="http://127.0.0.1:1/v1")
    with pytest.raises(ValueError, match="BIFROST_RUN_VK"):
        runner.start_batch("b_x", ["a", "b"], task, None, vks=["k1", "k2", "k3", "k4", "", "k6"], **kw)
    with pytest.raises(ValueError, match="unknown agent"):
        runner.start_batch("b_x", ["zzz"], task, None, vks=["k"] * 3, **kw)
    with pytest.raises(ValueError, match="no pool"):
        runner.start_batch("b_x", ["a"], task.model_copy(update={"id": "nope"}), None, vks=["k"] * 3, **kw)
    assert store.list_runs() == []


def test_run_that_raises_still_ends(env, monkeypatch):
    srv, _ = env
    real = runner.run_once

    def flaky(*a, on_start, **kw):  # the run starts, then the runner itself fails (e.g. SQLite locked)
        return real(*a, on_start=lambda rec: (on_start(rec), 1 / 0), **kw)

    monkeypatch.setattr(runner, "run_once", flaky)
    events = run(["a"], None, srv, ["k1", "k2", "k3"])
    done = [d for n, d in events if n == "run_done"]
    assert [d.status for d in done] == ["error"] * 3
    assert {r.status for r in store.list_runs(batch_id="b_test")} == {"error"}
    assert events[-1][0] == "batch_done"


def writer(body):
    return f"#!/usr/bin/env python3\nimport os\nopen(os.environ['ASSAY_OUTPUT'], 'w').write({body!r})\n"


def test_done_fact_run_is_graded_from_bifrost_usage(env, monkeypatch):
    srv, _ = env
    monkeypatch.setenv("BIFROST_SETUP_TOKEN", "tok-123")
    agent(runner.AGENTS_DIR, "w", writer("2008"))
    events = run(["w"], None, srv, ["k1", "k2", "k3"])
    done = [d for n, d in events if n == "run_done"]
    recs = store.list_runs(batch_id="b_test")
    assert len(done) == len(recs) == 3
    for r in recs:
        assert r.status == "done" and r.metrics.success is True
        assert r.metrics.tokens == 17 and r.metrics.steps == 0
        assert r.metrics.cost_usd == pytest.approx(2e-05)
        assert r.metrics.cost_by_model == {"qwen3.8-27b": pytest.approx(2e-05)}
    assert [d.metrics for d in sorted(done, key=lambda d: d.run_id)] == [r.metrics for r in sorted(recs, key=lambda r: r.id)]
    assert sorted(p.split("virtual_key_ids=")[1].split("&")[0] for p, _ in srv.gets) == ["vk-run-1", "vk-run-2", "vk-run-3"]
    assert all(p.startswith("/api/logs?") and "start_time=" in p for p, _ in srv.gets)
    assert {t for _, t in srv.gets} == {"tok-123"}


def test_briefing_run_claims_come_from_the_judge(env):
    srv, _ = env
    pool = json.loads(runner.find_pool(TASK_ID).read_text("utf-8"))
    doc = pool["docs"][0]
    quote = "Python 3.13 ships an experimental free-threaded build"
    assert quote in doc["content"]
    agent(runner.AGENTS_DIR, "w", writer(f"Python 3.13 has an experimental free-threaded build. {doc['url']}"))
    prompts = []

    def judge(prompt):
        prompts.append(prompt)
        return json.dumps([{"text": "Python 3.13 ships an experimental free-threaded build.", "verdict": "supported",
                            "source_url": doc["url"], "source_quote": quote}])

    task = runner.find_task(TASK_ID).model_copy(update={"type": "briefing"})
    run(["w"], None, srv, ["k1", "k2", "k3"], judge=judge, task=task)
    recs = store.list_runs(batch_id="b_test")
    assert len(recs) == 3 and len(prompts) == 3
    assert all("experimental free-threaded build. " + doc["url"] in p for p in prompts)
    for r in recs:
        assert r.status == "done"
        assert [(c.verdict, c.source_url, c.source_quote) for c in r.claims] == [("supported", doc["url"], quote)]
        assert r.metrics.claims_supported_pct == 1.0


def test_judge_failure_marks_runs_error(env):
    srv, _ = env
    pool = json.loads(runner.find_pool(TASK_ID).read_text("utf-8"))
    agent(runner.AGENTS_DIR, "w", writer(pool["docs"][0]["url"]))

    def judge(prompt):
        raise RuntimeError("judge down")

    task = runner.find_task(TASK_ID).model_copy(update={"type": "briefing"})
    events = run(["w"], None, srv, ["k1", "k2", "k3"], judge=judge, task=task)
    assert [d.status for n, d in events if n == "run_done"] == ["error"] * 3
    recs = store.list_runs(batch_id="b_test")
    assert len(recs) == 3
    for r in recs:
        assert r.status == "error" and r.steps[-1].kind == "error" and r.steps[-1].detail.startswith("grading:")
        assert "judge down" in r.steps[-1].detail


def test_run_without_usage_is_error(env):
    srv, _ = env
    srv.logs = b'{"logs": []}'
    agent(runner.AGENTS_DIR, "w", writer("2008"))
    events = run(["w"], None, srv, ["k1", "k2", "k3"])
    assert [d.status for n, d in events if n == "run_done"] == ["error"] * 3
    for r in store.list_runs(batch_id="b_test"):
        assert r.status == "error" and r.steps[-1].detail.startswith("grading:")
