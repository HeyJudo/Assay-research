import json

from fastapi.testclient import TestClient

from assay import api, snapshot


def test_snapshot_matches_published_results(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "empty.db"))
    snapshot.write_snapshot(tmp_path / "out")
    runs = json.loads((tmp_path / "out/runs.json").read_text("utf-8"))
    published = json.loads(api.BENCH_RESULTS.read_text("utf-8"))
    assert len(runs) == len(published) == 136
    assert all(r["steps"] for r in runs if r["status"] == "done")
    board = json.loads((tmp_path / "out/leaderboard.json").read_text("utf-8"))
    assert {row["agent_id"] for row in board} == {r["agent_id"] for r in published}
    assert board == TestClient(api.app).get("/api/leaderboard").json()
    for name in ("agents", "tasks"):
        assert json.loads((tmp_path / f"out/{name}.json").read_text("utf-8"))
