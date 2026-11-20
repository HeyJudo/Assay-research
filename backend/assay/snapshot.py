"""Snapshot the read-only API responses for the static judge demo.

Run from backend/: uv run python -m assay.snapshot
"""
import json
import os
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "snapshot"


def write_snapshot(out_dir: Path) -> None:
    from fastapi.testclient import TestClient

    from assay import api

    client = TestClient(api.app)
    out_dir.mkdir(parents=True, exist_ok=True)
    data = {name: client.get(f"/api/{name}").json() for name in ("agents", "tasks", "leaderboard")}
    # /api/runs reads SQLite and drops steps, so take the full published list
    data["runs"] = json.loads(api.BENCH_RESULTS.read_text("utf-8"))
    for name, body in data.items():
        (out_dir / f"{name}.json").write_text(
            json.dumps(body, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    # empty temp DB so a local assay.db never leaks into the snapshot
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["ASSAY_DB"] = str(Path(tmp) / "empty.db")
        write_snapshot(OUT)
