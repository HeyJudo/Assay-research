"""SQLite run store (PRD §7): indexed columns plus the full record as JSON."""

import json
import os
import sqlite3
from pathlib import Path

from assay.models import RunRecord

FIXTURE = Path(__file__).resolve().parents[2] / "web" / "src" / "fixtures" / "runs.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, batch_id TEXT, agent_id TEXT, task_id TEXT,
  status TEXT, started_at TEXT, record TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS runs_batch ON runs(batch_id);
CREATE INDEX IF NOT EXISTS runs_agent ON runs(agent_id);
CREATE INDEX IF NOT EXISTS runs_task ON runs(task_id);
"""


def db_path() -> Path:
    return Path(os.environ.get("ASSAY_DB") or Path(__file__).parents[1] / "assay.db")


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(db_path())
    con.executescript(SCHEMA)
    return con


def save(rec: RunRecord) -> None:
    with connect() as con:  # ponytail: connection per call, pool if write rate ever matters
        con.execute(
            "INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?,?)",
            (rec.id, rec.batch_id, rec.agent_id, rec.task_id, rec.status, rec.started_at, rec.model_dump_json()),
        )


def get(run_id: str) -> RunRecord | None:
    row = connect().execute("SELECT record FROM runs WHERE id=?", (run_id,)).fetchone()
    return RunRecord.model_validate_json(row[0]) if row else None


def list_runs(batch_id=None, agent_id=None, task_id=None) -> list[RunRecord]:
    f = {"batch_id": batch_id, "agent_id": agent_id, "task_id": task_id}
    f = {k: v for k, v in f.items() if v is not None}
    where = " WHERE " + " AND ".join(f"{k}=?" for k in f) if f else ""
    rows = connect().execute(f"SELECT record FROM runs{where} ORDER BY started_at", list(f.values()))
    return [RunRecord.model_validate_json(r[0]) for r in rows]


def seed_if_empty() -> None:
    if connect().execute("SELECT 1 FROM runs LIMIT 1").fetchone():
        return
    for r in json.loads(FIXTURE.read_text("utf-8")):
        save(RunRecord.model_validate(r))
