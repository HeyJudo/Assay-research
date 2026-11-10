import pytest
from fastapi.testclient import TestClient

from assay import store
from assay.api import app

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
