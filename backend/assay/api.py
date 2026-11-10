"""Read-only API. Runs come from SQLite (seeded from fixtures when empty). Leaderboard, agents, tasks and compare still read fixtures. POST and SSE endpoints come later (PRD §8)."""

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from assay import store
from assay.models import Agent, Compare, LeaderboardRow, RunRecord, Task

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "web" / "src" / "fixtures"  # ponytail: one copy shared with the web app
DIST = ROOT / "web" / "dist"


def load(name: str, model):
    return [model.model_validate(x) for x in json.loads((FIXTURES / name).read_text("utf-8"))]


AGENTS = load("agents.json", Agent)
TASKS = load("tasks.json", Task)
LEADERBOARD = load("leaderboard.json", LeaderboardRow)

@asynccontextmanager
async def lifespan(_):
    if os.environ.get("ASSAY_SEED_FIXTURES") == "1":
        store.seed_if_empty()
    yield


app = FastAPI(title="Assay", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/leaderboard")
def leaderboard() -> list[LeaderboardRow]:
    return LEADERBOARD


@app.get("/api/agents")
def agents() -> list[Agent]:
    return AGENTS


@app.get("/api/tasks")
def tasks() -> list[Task]:
    return TASKS


@app.get("/api/runs")
def runs(batch_id: str | None = None, agent_id: str | None = None, task_id: str | None = None):
    return [r.model_dump(exclude={"steps"}) for r in store.list_runs(batch_id, agent_id, task_id)]


@app.get("/api/runs/{run_id}")
def run(run_id: str) -> RunRecord:
    r = store.get(run_id)
    if r is None:
        raise HTTPException(404, "run not found")
    return r


@app.get("/api/compare")
def compare(a: str, b: str, batch_id: str | None = None) -> Compare:
    # ponytail: fixture returns full-benchmark rows for both scopes; real batch aggregates come with the runner
    rows = {r.agent_id: r for r in LEADERBOARD}
    if a not in rows or b not in rows:
        raise HTTPException(404, "agent not found")
    return Compare(scope="batch" if batch_id else "full", a=rows[a], b=rows[b])


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    """Serve the built React app. Unknown paths get index.html so client routes like /runs/run_001 work."""
    if path.startswith("api/") or not DIST.is_dir():
        raise HTTPException(404)
    f = (DIST / path).resolve()
    return FileResponse(f if f.is_file() and f.is_relative_to(DIST) else DIST / "index.html")
