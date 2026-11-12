"""API (PRD §8). Runs come from SQLite (seeded from fixtures when empty). Leaderboard, agents, tasks and compare still read fixtures. Batches run through runner.start_batch."""

import asyncio
import hmac
import json
import os
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from assay import runner, store
from assay.models import (Agent, BatchCreated, BatchRequest, BatchStatus, Compare, LeaderboardRow, RunRecord,
                          Task)

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


# ponytail: in memory, a restart forgets batches (their runs stay in SQLite)
BATCHES: dict[str, dict] = {}  # batch id -> {"status": BatchStatus, "events": [(name, json)]}
BATCH_LOCK = threading.Lock()


@app.post("/api/batches")
def create_batch(req: BatchRequest) -> BatchCreated:
    want = os.environ.get("RUN_PASSCODE", "")
    if not want or not hmac.compare_digest(req.passcode.encode(), want.encode()):
        raise HTTPException(403, "wrong passcode")
    if len(set(req.agents)) != len(req.agents):
        raise HTTPException(422, "each agent once")
    task = runner.find_task(req.task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    with BATCH_LOCK:
        if any(b["status"].status == "running" for b in BATCHES.values()):
            raise HTTPException(409, "another batch is running")
        bid = f"b_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        b = BATCHES[bid] = {"events": [], "status": BatchStatus(
            batch_id=bid, status="running", agents=req.agents, task_id=req.task_id, trap=req.trap,
            repeats=runner.REPEATS, started_at=now)}

    def emit(name, data):  # called from run threads; list.append is atomic
        b["events"].append((name, data.model_dump_json()))
        if name == "batch_done":
            b["status"] = b["status"].model_copy(update={"status": "done"})

    try:
        runner.start_batch(bid, req.agents, task, req.trap, emit=emit,
                           bifrost_url=os.environ.get("BIFROST_URL") or "http://localhost:8080/v1",
                           vks=[os.environ.get(f"BIFROST_RUN_VK_{i}", "") for i in range(1, 10)])
    except (ValueError, RuntimeError) as e:
        del BATCHES[bid]
        raise HTTPException(422 if isinstance(e, ValueError) else 503, str(e))
    return BatchCreated(batch_id=bid)


def _batch(batch_id: str) -> dict:
    if batch_id not in BATCHES:
        raise HTTPException(404, "batch not found")
    return BATCHES[batch_id]


@app.get("/api/batches/{batch_id}")
def batch_status(batch_id: str) -> BatchStatus:
    return _batch(batch_id)["status"]


@app.get("/api/batches/{batch_id}/stream")
async def batch_stream(batch_id: str, request: Request):
    """SSE. Each message has `id: <n>`, so EventSource resumes after Last-Event-ID on reconnect."""
    b = _batch(batch_id)
    try:
        start = int(request.headers.get("last-event-id", "-1")) + 1
    except ValueError:
        start = 0

    async def events():
        i = start
        while True:
            done = b["status"].status == "done"  # read before draining: batch_done is appended before this flips
            while i < len(b["events"]):
                name, data = b["events"][i]
                yield f"id: {i}\nevent: {name}\ndata: {data}\n\n"
                i += 1
            if done or await request.is_disconnected():
                return
            await asyncio.sleep(0.25)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    """Serve the built React app. Unknown paths get index.html so client routes like /runs/run_001 work."""
    if path.startswith("api/") or not DIST.is_dir():
        raise HTTPException(404)
    f = (DIST / path).resolve()
    return FileResponse(f if f.is_file() and f.is_relative_to(DIST) else DIST / "index.html")
