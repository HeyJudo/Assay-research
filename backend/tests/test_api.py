import json

import pytest
from fastapi.testclient import TestClient

from assay import judge_agreement, store
from assay.api import app
from assay.store import FIXTURE

FIXTURE_IDS = ["run_001", "run_002", "run_003", "run_004"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("ASSAY_SEED_FIXTURES", "1")
    with TestClient(app) as c:
        yield c


def test_no_seed_by_default(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    monkeypatch.delenv("ASSAY_SEED_FIXTURES", raising=False)
    with TestClient(app) as c:
        assert c.get("/api/runs").json() == []


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
