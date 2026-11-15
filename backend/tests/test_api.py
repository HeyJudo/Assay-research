import json
import os
import threading
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from assay import api, judge_agreement, runner, store
from assay.api import app
from assay.leaderboard import aggregate
from assay.models import RunRecord
from assay.store import FIXTURE

FIXTURE_IDS = ["run_001", "run_002", "run_003", "run_004"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("ASSAY_SEED_FIXTURES", "1")
    monkeypatch.setattr(api, "BENCH_RESULTS", tmp_path / "missing_bench_runs.json")
    with TestClient(app) as c:
        yield c


def test_no_seed_by_default(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    monkeypatch.delenv("ASSAY_SEED_FIXTURES", raising=False)
    with TestClient(app) as c:
        assert c.get("/api/runs").json() == []


def test_empty_db_leaderboard_aggregates_published_benchmark_runs(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "empty.db"))
    monkeypatch.delenv("ASSAY_SEED_FIXTURES", raising=False)
    records = [RunRecord.model_validate(r) for r in json.loads(
        (api.ROOT / "data" / "results" / "bench_runs.json").read_text("utf-8"))]
    expected = [aggregate(records, agent).model_dump() for agent in sorted({r.agent_id for r in records})]
    with TestClient(app) as c:
        assert c.get("/api/leaderboard").json() == expected
        comparison = c.get("/api/compare", params={"a": expected[0]["agent_id"], "b": expected[-1]["agent_id"]})
        assert comparison.json() == {"scope": "full", "a": expected[0], "b": expected[-1]}
    assert store.list_runs() == []


def test_list_seeded_without_steps(client):
    rows = client.get("/api/runs").json()
    assert [r["id"] for r in rows] == FIXTURE_IDS
    assert all("steps" not in r for r in rows)


def test_filter_by_agent(client):
    rows = client.get("/api/runs", params={"agent_id": "gpt-researcher"}).json()
    assert [r["id"] for r in rows] == ["run_002"]


def test_filter_by_batch_and_task(client):
    assert [r["id"] for r in client.get("/api/runs", params={"batch_id": "b_003"}).json()] == ["run_003"]
    assert [r["id"] for r in client.get("/api/runs", params={"task_id": "brief-maxim"}).json()] == ["run_004"]


def test_detail_has_steps(client):
    body = client.get("/api/runs/run_001").json()
    assert body["id"] == "run_001"
    assert body["steps"]


def test_unknown_run_404(client):
    r = client.get("/api/runs/nope")
    assert r.status_code == 404
    assert r.json()["detail"] == "run not found"


def test_saved_run_appears(client):
    rec = store.get("run_001").model_copy(update={"id": "run_new", "started_at": "2026-11-10T00:00:00Z"})
    store.save(rec)
    assert [r["id"] for r in client.get("/api/runs").json()][-1] == "run_new"


LEADERBOARD_FIXTURE = json.loads((FIXTURE.parent / "leaderboard.json").read_text("utf-8"))


def bench(rid, agent, ok, batch="bench_1", **metrics):
    """A fixture run moved into a batch. Fixture runs are briefing, trap null, repeat 1."""
    rec = store.get("run_001")
    return rec.model_copy(update={"id": rid, "batch_id": batch, "agent_id": agent,
                                  "metrics": rec.metrics.model_copy(update={"success": ok, **metrics})})


def test_leaderboard_falls_back_to_fixtures_without_benchmark_runs(client):
    assert client.get("/api/leaderboard").json() == LEADERBOARD_FIXTURE  # seeded runs are demo batches (b_)


def test_leaderboard_uses_only_benchmark_batches(client):
    store.save(bench("r1", "a", True, cost_usd=0.02))
    store.save(bench("r2", "a", False, cost_usd=0.02))
    store.save(bench("r3", "a", False, batch="b_demo"))  # live demo batch, not counted
    rows = client.get("/api/leaderboard").json()
    assert [(r["agent_id"], r["accuracy"], r["cost_per_correct"], r["runs"]) for r in rows] == [("a", 0.5, 0.04, 2)]


def test_compare_full_scope_uses_benchmark(client):
    store.save(bench("r1", "a", True))
    store.save(bench("r2", "b", False))
    store.save(bench("r3", "b", True, batch="b_demo"))
    body = client.get("/api/compare", params={"a": "a", "b": "b"}).json()
    assert (body["scope"], body["a"]["accuracy"], body["b"]["accuracy"]) == ("full", 1.0, 0.0)


def test_compare_batch_scope_uses_that_batch(client):
    store.save(bench("r1", "a", True))
    store.save(bench("r2", "a", False, batch="b_demo"))
    store.save(bench("r3", "b", True, batch="b_demo"))
    body = client.get("/api/compare", params={"a": "a", "b": "b", "batch_id": "b_demo"}).json()
    assert (body["scope"], body["a"]["accuracy"], body["b"]["accuracy"]) == ("batch", 0.0, 1.0)


def test_compare_falls_back_to_fixtures_without_benchmark_runs(client):
    body = client.get("/api/compare", params={"a": "briefing-baseline", "b": "gpt-researcher"}).json()
    assert (body["scope"], body["a"], body["b"]) == ("full", LEADERBOARD_FIXTURE[2], LEADERBOARD_FIXTURE[3])


def test_compare_agent_without_runs_404(client):
    store.save(bench("r1", "a", True))
    assert client.get("/api/compare", params={"a": "a", "b": "nope"}).status_code == 404


def test_judge_agreement_null_until_run(client, tmp_path, monkeypatch):
    monkeypatch.setattr(judge_agreement, "RESULT", tmp_path / "ja.json")
    assert client.get("/api/judge-agreement").json() is None


def test_judge_agreement_saved_by_script(client, tmp_path, monkeypatch):
    monkeypatch.setattr(judge_agreement, "RESULT", tmp_path / "ja.json")
    labels = tmp_path / "labels.json"
    labels.write_text(json.dumps([{"human": "supported", "judge": "supported"}] * 49
                                 + [{"human": "trap", "judge": "supported"}]))
    monkeypatch.setattr("sys.argv", ["judge_agreement", str(labels)])
    judge_agreement.main()
    assert client.get("/api/judge-agreement").json() == {
        "agreement_pct": 98, "claims": 50, "matches": 49, "disagreements": {"trap->supported": 1}}


def test_agents_are_the_real_agent_folders_without_stub(client):
    body = client.get("/api/agents").json()
    assert [a["id"] for a in body] == ["briefing-baseline", "briefing-cheap-first", "briefing-evidence-gated",
                                       "gpt-researcher"]
    assert {a["id"]: a["kind"] for a in body}["gpt-researcher"] == "outside"
    assert all(a["name"] and a["description"] for a in body)


def test_agents_read_agent_json(client, tmp_path, monkeypatch):
    monkeypatch.setattr(runner, "AGENTS_DIR", tmp_path)
    for name in ("x", "stub"):
        (tmp_path / name).mkdir()
        (tmp_path / name / "run").write_text("")
        (tmp_path / name / "agent.json").write_text(json.dumps(
            {"version": "1", "models": ["m"], "prompt_hash": "p", "name": name.upper(), "kind": "outside",
             "description": "d"}))
    assert client.get("/api/agents").json() == [{"id": "x", "name": "X", "kind": "outside", "description": "d"}]


def test_tasks_are_the_benchmark_suite_without_practice(client):
    body = client.get("/api/tasks").json()
    assert len(body) == 11 and not any(t["id"].startswith("practice") for t in body)
    hinton = next(t for t in body if t["id"] == "fact-hinton-university-trap")
    assert (hinton["type"], hinton["answer"]) == ("fact", "1582")  # from data/tasks/fact-hinton-university-trap.json


BRIEF_BODY = {"subject": "Tavily", "meeting_time": "2026-11-20T01:00:00Z", "version": "briefing-baseline"}
BRIEF_TEXT = "## Verified\n- News [source](https://tavily.com)\n## Uncertain\nNone\n## Not found\nNone\n## Open questions\n- Priorities?"


@pytest.fixture
def briefing(monkeypatch):
    job = SimpleNamespace(entered=threading.Event(), release=threading.Event(), finished=threading.Event(),
                          error=None, seen=None, text=BRIEF_TEXT)
    monkeypatch.setenv("BIFROST_URL", "http://bifrost.test/v1")
    monkeypatch.setenv("BIFROST_RUN_VK_1", "sk-bf-live-test")
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-live-test")
    monkeypatch.setenv("OPENAI_API_KEY", "parent-key")
    monkeypatch.setenv("NO_PROXY", "parent-host")

    def brief(*args):
        job.seen = (args, {k: os.environ[k] for k in ("OPENAI_BASE_URL", "OPENAI_API_KEY", "TAVILY_API_KEY", "NO_PROXY")})
        job.entered.set()
        assert job.release.wait(5)
        if job.error:
            raise job.error
        return job.text

    save = store.save

    def saved(rec):
        save(rec)
        if rec.task_id == "brief-live" and rec.status != "running":
            job.finished.set()

    monkeypatch.setattr(api.briefing_agent, "brief", brief)
    monkeypatch.setattr(store, "save", saved)
    monkeypatch.setattr(api.runner, "fetch_usage", lambda *args: [
        {"model": "qwen3.8-27b", "input_tokens": 10, "output_tokens": 20, "cost_usd": 0.001,
         "at": "2026-11-20T01:00:05+00:00"}])  # shape of runner.fetch_usage rows
    monkeypatch.setattr(api.graders, "grade_run", lambda *args: pytest.fail("live briefs must not be judged"))
    yield job
    job.release.set()
    if job.entered.is_set():
        assert job.finished.wait(5)
        with api.BRIEF_LOCK:
            pass


@pytest.mark.parametrize("version", ["baseline", "cheap-first", "evidence-gated"])
def test_live_brief_running_to_done(client, briefing, version):
    response = client.post("/api/brief", json={**BRIEF_BODY, "version": f"briefing-{version}"})
    assert response.status_code == 200
    rid = response.json()["run_id"]
    assert briefing.entered.wait(5)
    running = client.get(f"/api/runs/{rid}").json()
    assert running["status"] == "running"
    assert running["batch_id"].startswith("brief_") and not running["batch_id"].startswith("bench_")
    assert (running["task_id"], running["task_type"], running["trap"], running["repeat"]) == ("brief-live", "briefing", None, 1)
    meta = api.runner.find_agent(f"briefing-{version}")[1]
    assert running["config"] == {"agent_version": meta["version"], "models": meta["models"],
                                 "prompt_hash": meta["prompt_hash"], "pool_version": "live",
                                 "trap_seed": None, "fallback_used": False}
    assert briefing.seen == (("Tavily", BRIEF_BODY["meeting_time"], version), {
        "OPENAI_BASE_URL": "http://bifrost.test/v1", "OPENAI_API_KEY": "sk-bf-live-test",
        "TAVILY_API_KEY": "tvly-live-test", "NO_PROXY": "*"})
    assert client.post("/api/brief", json=BRIEF_BODY).status_code == 409
    briefing.release.set()
    assert briefing.finished.wait(5)
    done = client.get(f"/api/runs/{rid}").json()
    assert done["status"] == "done" and done["output"]["text"] == BRIEF_TEXT
    assert done["duration_s"] >= 0
    assert done["claims"] == [] and done["metrics"]["claims_supported_pct"] is None
    assert (done["metrics"]["cost_usd"], done["metrics"]["tokens"], done["metrics"]["cost_by_model"]) == (
        0.001, 30, {"qwen3.8-27b": 0.001})
    # Receipt shows the Bifrost call (no proxy log on live briefs, so no search steps).
    assert [(s["kind"], s["detail"], s["model"], s["tokens"], s["cost_usd"]) for s in done["steps"]] == [
        ("llm", "10 in, 20 out", "qwen3.8-27b", 30, 0.001)]
    assert (done["metrics"]["steps"], done["metrics"]["tool_calls"]) == (1, 1)
    assert client.get("/api/leaderboard").json() == LEADERBOARD_FIXTURE
    assert os.environ["OPENAI_API_KEY"] == "parent-key" and os.environ["NO_PROXY"] == "parent-host"


def test_live_brief_unknown_version(client):
    assert client.post("/api/brief", json={**BRIEF_BODY, "version": "briefing-nope"}).status_code == 422


def test_live_brief_bracketed_sources_become_clickable(client, briefing):
    briefing.text = BRIEF_TEXT + "\n- Update [https://tavily.com/news]"
    rid = client.post("/api/brief", json=BRIEF_BODY).json()["run_id"]
    briefing.release.set()
    assert briefing.finished.wait(5)
    record = client.get(f"/api/runs/{rid}").json()
    assert record["status"] == "done"
    assert record["output"]["text"] == BRIEF_TEXT + "\n- Update [https://tavily.com/news](https://tavily.com/news)"


def test_live_brief_refuses_running_batch(client, monkeypatch):
    monkeypatch.setitem(api.BATCHES, "busy", {"status": SimpleNamespace(status="running")})
    assert client.post("/api/brief", json=BRIEF_BODY).status_code == 409


def test_batch_refuses_running_brief(client, briefing, monkeypatch):
    monkeypatch.setenv("RUN_PASSCODE", "test-passcode")
    client.post("/api/brief", json=BRIEF_BODY)
    assert briefing.entered.wait(5)
    response = client.post("/api/batches", json={"agents": ["briefing-baseline"], "task_id": "brief-tavily",
                                                "trap": None, "passcode": "test-passcode"})
    assert response.status_code == 409


def test_live_brief_missing_key_stops_polling(client, briefing, monkeypatch):
    monkeypatch.delenv("BIFROST_RUN_VK_1")
    rid = client.post("/api/brief", json=BRIEF_BODY).json()["run_id"]
    assert briefing.finished.wait(5)
    with api.BRIEF_LOCK:
        pass
    record = client.get(f"/api/runs/{rid}").json()
    assert record["status"] == "error" and "BIFROST_RUN_VK_1" in record["steps"][0]["detail"]


@pytest.mark.parametrize("invalid", [{"subject": "x" * 151}, {"subject": ""},
                                     {"meeting_time": "tomorrow"}, {"meeting_time": "2026-11-20"}])
def test_live_brief_validates_request(client, invalid):
    assert client.post("/api/brief", json={**BRIEF_BODY, **invalid}).status_code == 422


def test_live_brief_error_stops_polling(client, briefing):
    briefing.error = RuntimeError("search failed tvly-live-test sk-bf-live-test")
    rid = client.post("/api/brief", json=BRIEF_BODY).json()["run_id"]
    briefing.release.set()
    assert briefing.finished.wait(5)
    record = client.get(f"/api/runs/{rid}").json()
    assert record["status"] == "error"
    assert record["steps"][0]["kind"] == "error"
    assert record["steps"][0]["detail"] == "search failed [redacted] [redacted]"


@pytest.mark.parametrize("unavailable", [False, True])
def test_live_brief_without_usage_still_done(client, briefing, monkeypatch, unavailable):
    def usage(*args):
        if unavailable:
            raise OSError("Bifrost logs unavailable")
        return []
    monkeypatch.setattr(api.runner, "fetch_usage", usage)
    rid = client.post("/api/brief", json=BRIEF_BODY).json()["run_id"]
    briefing.release.set()
    assert briefing.finished.wait(5)
    record = client.get(f"/api/runs/{rid}").json()
    assert record["status"] == "done" and record["metrics"]["cost_usd"] == 0
