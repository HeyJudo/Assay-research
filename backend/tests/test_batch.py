"""start_batch: real search proxy, real agent subprocesses, real SQLite. Only Bifrost is a local stand-in."""

import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

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
    for k in ("BIFROST_ADMIN_USER", "BIFROST_ADMIN_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
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
    # Failed runs spent tokens too: the fixture's Bifrost row (it predates the run, so t=0), then the exit.
    # never_judge would have raised: not graded.
    for r in store.list_runs(batch_id="b_test"):
        full = store.get(r.id)
        assert [(s.kind, s.model, s.tokens) for s in full.steps] == [("llm", "qwen3.8-27b", 17), ("error", None, 0)]
        assert full.metrics.steps == 2 and full.metrics.tool_calls == 1
        assert [d.step for n, d in events if n == "step" and d.run_id == r.id] == full.steps
    assert events[-1][0] == "batch_done"
    assert len(srv.gets) == 3


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
        assert r.metrics.tokens == 17 and r.metrics.steps == r.metrics.tool_calls == 1  # the one Bifrost row
        assert r.metrics.cost_usd == pytest.approx(2e-05)
        assert r.metrics.cost_by_model == {"qwen3.8-27b": pytest.approx(2e-05)}
    assert [d.metrics for d in sorted(done, key=lambda d: d.run_id)] == [r.metrics for r in sorted(recs, key=lambda r: r.id)]
    # Slot n = repeat n here: each run asks for its own slot's key, from its own start.
    queries = [parse_qs(urlsplit(p).query) for p, _ in srv.gets]
    assert all(p.startswith("/api/logs?") for p, _ in srv.gets)
    assert {q["virtual_key_ids"][0]: q["start_time"][0] for q in queries} == \
           {f"vk-run-{r.repeat}": r.started_at for r in recs}
    assert {t for _, t in srv.gets} == {"tok-123"}
    assert srv.auths == [None] * 3  # no admin login set: setup token only


def test_usage_read_with_admin_login_when_set(env, monkeypatch):
    # A Bifrost with a dashboard admin refuses the setup token and wants Basic auth.
    srv, _ = env
    monkeypatch.setenv("BIFROST_ADMIN_USER", "admin")
    monkeypatch.setenv("BIFROST_ADMIN_PASSWORD", "pw")
    agent(runner.AGENTS_DIR, "w", writer("2008"))
    run(["w"], None, srv, ["k1", "k2", "k3"])
    assert srv.auths == ["Basic YWRtaW46cHc="] * 3  # base64("admin:pw")
    assert {r.status for r in store.list_runs(batch_id="b_test")} == {"done"}


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


SEARCH_LOG = runner.BACKEND / "tests" / "fixtures" / "search_log.jsonl"  # captured: searcher agent through the real proxy
RID, START = "run_c329ca2813eb", "2026-11-14T14:32:13.045Z"  # that run's id and started_at


def test_timeline_merges_proxy_log_and_bifrost_usage(env, tmp_path):
    srv, _ = env
    # The captured Bifrost row, moved into the captured run's window, plus a copy on another model (a switch).
    row = json.loads(srv.logs)["logs"][0]
    srv.logs = json.dumps({"logs": [{**row, "timestamp": "2026-11-14T14:32:13.545Z"},
                                    {**row, "alias": "gemma-4-26b-a4b-it", "timestamp": "2026-11-14T14:32:15.045Z"}]}).encode()
    usage = runner.fetch_usage(f"http://127.0.0.1:{srv.server_port}/v1", "vk-run-1", START)
    log = tmp_path / "search.jsonl"
    captured = SEARCH_LOG.read_text("utf-8")
    other = json.loads(captured.splitlines()[0]) | {"run_id": "run_other"}
    log.write_text(captured + json.dumps(other) + "\n", encoding="utf-8")
    error = runner.Step(i=1, t=3.0, kind="error", detail="exit 1", model=None, phase="write", tokens=0, cost_usd=0)
    steps = runner._timeline(log, RID, START, usage, [error])
    got = [(s.i, s.kind, s.detail, s.model, s.phase, s.tokens) for s in steps]
    assert got == [
        (1, "llm", "15 in, 2 out", "qwen3.8-27b", "plan", 17),
        (2, "search", "python 3.0 release", None, "search", 0),
        (3, "read", "https://docs-python.invalid/3.13/free-threading", None, "search", 0),
        (4, "read", "https://docs-python.invalid/3.13/free-threading/", None, "search", 0),  # served: proxy drops the /
        (5, "read", "https://docs-python.invalid/3.13/free-threading", None, "search", 0),  # httpx dropped the #gil
        (6, "read", "http://not-in-pool.invalid/x (not in pool)", None, "search", 0),
        (7, "switch", "qwen3.8-27b to gemma-4-26b-a4b-it", "gemma-4-26b-a4b-it", "write", 0),
        (8, "llm", "15 in, 2 out", "gemma-4-26b-a4b-it", "write", 17),
        (9, "error", "exit 1", None, "write", 0),
    ]
    assert [s.t for s in steps] == pytest.approx([0.5, 1.621631, 1.6366826, 1.6392248, 1.64323, 1.665486, 2.0, 2.0, 3.0])
    assert [s.cost_usd for s in steps] == pytest.approx([2e-05, 0, 0, 0, 0, 0, 0, 2e-05, 0])


def test_batch_runs_carry_their_timeline(env):
    srv, _ = env
    row = json.loads(srv.logs)["logs"][0]
    srv.logs = json.dumps({"logs": [{**row, "timestamp": "2999-01-01T00:00:00Z"}]}).encode()  # after every search
    agent(runner.AGENTS_DIR, "s", PROBE.replace("time.sleep(1.5)", "").replace(
        "json.dumps(dict(", "'2008' or json.dumps(dict("))
    events = run(["s"], None, srv, ["k1", "k2", "k3"])
    recs = store.list_runs(batch_id="b_test")
    assert len(recs) == 3
    for r in recs:
        full = store.get(r.id)
        assert full.status == "done", full.steps
        assert [(s.kind, s.detail) for s in full.steps] == [("search", "python 3.0 release"), ("llm", "15 in, 2 out")]
        assert full.metrics.steps == 2 and full.metrics.tool_calls == 2
        assert [d.step for n, d in events if n == "step" and d.run_id == r.id] == full.steps


def test_bad_search_log_still_ends_the_run(env, monkeypatch):
    srv, _ = env

    def broken(*a):
        raise KeyError("query")  # e.g. a log line in a shape the timeline does not know

    monkeypatch.setattr(runner, "_timeline", broken)
    events = run(["a"], None, srv, ["k1", "k2", "k3"])
    assert [d.status for n, d in events if n == "run_done"] == ["error"] * 3
    for r in store.list_runs(batch_id="b_test"):
        assert store.get(r.id).steps[-1].detail.startswith("timeline: KeyError")


def test_bad_search_log_keeps_budget_exceeded(env, monkeypatch):
    srv, _ = env

    def broken(*a):
        raise KeyError("query")

    monkeypatch.setattr(runner, "_timeline", broken)
    agent(runner.AGENTS_DIR, "x", "#!/usr/bin/env python3\nimport sys\nsys.exit('402 budget_exceeded')\n")
    events = run(["x"], None, srv, ["k1", "k2", "k3"])
    assert [d.status for n, d in events if n == "run_done"] == ["budget_exceeded"] * 3
