"""API (PRD §8). Runs come from SQLite (seeded from fixtures when empty). Leaderboard and compare aggregate benchmark runs
(batch ids starting "bench_") and fall back to published results, then fixtures. Agents come from backend/agents/*/agent.json,
tasks from data/tasks.
Batches run through runner.start_batch."""

import asyncio
import hmac
import json
import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from agents import briefing_agent
from assay import bench, graders, judge_agreement, runner, store
from assay.leaderboard import aggregate
from assay.models import (Agent, BatchCreated, BatchRequest, BatchStatus, BriefRequest, Compare, JudgeAgreement,
                          LeaderboardRow, RunConfig, RunMetrics, RunOutput, RunRecord, Step, Task)

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "web" / "src" / "fixtures"  # ponytail: one copy shared with the web app
BENCH_RESULTS = ROOT / "data" / "results" / "bench_runs.json"
DIST = ROOT / "web" / "dist"


def load(name: str, model):
    return [model.model_validate(x) for x in json.loads((FIXTURES / name).read_text("utf-8"))]


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


BENCH_PREFIX = "bench_"  # full-benchmark batch ids; live-demo batches are "b_"


def bench_runs() -> list[RunRecord]:
    # ponytail: loads every record then filters, a LIKE query in store if runs reach the thousands
    runs = [r for r in store.list_runs() if r.batch_id.startswith(BENCH_PREFIX)]
    if not runs and BENCH_RESULTS.exists():
        runs = [RunRecord.model_validate(r) for r in json.loads(BENCH_RESULTS.read_text("utf-8"))]
    return runs


def rows(runs: list[RunRecord]) -> list[LeaderboardRow]:
    return [row for a in sorted({r.agent_id for r in runs}) if (row := aggregate(runs, a))]


@app.get("/api/leaderboard")
def leaderboard() -> list[LeaderboardRow]:
    runs = bench_runs()
    return rows(runs) if runs else LEADERBOARD


@app.get("/api/judge-agreement")
def judge_agreement_result() -> JudgeAgreement | None:
    f = judge_agreement.RESULT
    return JudgeAgreement.model_validate_json(f.read_text("utf-8")) if f.exists() else None


@app.get("/api/agents")
def agents() -> list[Agent]:
    metas = [(a, runner.find_agent(a)[1]) for a in bench.agent_ids()]
    return [Agent(id=a, name=m["name"], kind=m["kind"], description=m["description"]) for a, m in metas]


@app.get("/api/tasks")
def tasks() -> list[Task]:
    return [runner.find_task(t) for t in bench.task_ids()]


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
    runs = store.list_runs(batch_id=batch_id) if batch_id else bench_runs()
    table = {r.agent_id: r for r in (rows(runs) if runs or batch_id else LEADERBOARD)}
    if a not in table or b not in table:
        raise HTTPException(404, "agent not found in this scope")
    return Compare(scope="batch" if batch_id else "full", a=table[a], b=table[b])


# ponytail: in memory, a restart forgets batches (their runs stay in SQLite)
BATCHES: dict[str, dict] = {}  # batch id -> {"status": BatchStatus, "events": [(name, json)]}
BATCH_LOCK = threading.Lock()
BRIEF_LOCK = threading.Lock()  # live briefs share run slot 1 and the process environment


def check_passcode(passcode: str) -> None:
    want = os.environ.get("RUN_PASSCODE", "")
    if not want or not hmac.compare_digest(passcode.encode(), want.encode()):
        raise HTTPException(403, "wrong passcode")


@app.post("/api/brief")
def create_brief(req: BriefRequest):
    check_passcode(req.passcode)
    version = req.version.removeprefix("briefing-")
    if version not in {"baseline", "cheap-first", "evidence-gated"}:
        raise HTTPException(422, "unknown briefing version")
    found = runner.find_agent(f"briefing-{version}")
    if found is None:
        raise HTTPException(503, "briefing agent not installed")
    _, meta = found
    config = RunConfig(agent_version=meta["version"], models=meta["models"], prompt_hash=meta["prompt_hash"],
                       pool_version="live", trap_seed=None, fallback_used=False)
    rec = RunRecord(
        id=f"run_{uuid.uuid4().hex[:12]}", batch_id=f"brief_{uuid.uuid4().hex}",
        agent_id=f"briefing-{version}", task_id="brief-live", task_type="briefing", trap=None, repeat=1,
        status="running", started_at=datetime.now(timezone.utc).isoformat(), duration_s=None, config=config,
        output=RunOutput(text="", abstained=False), steps=[], claims=[],
        metrics=RunMetrics(success=False, steps=0, tool_calls=0, tokens=0, cost_usd=0, cost_by_model={},
                           switched=False, trap_fell=False, abstention=None, claims_supported_pct=None))
    env = {"OPENAI_BASE_URL": os.environ.get("BIFROST_URL") or "http://localhost:8080/v1",
           "OPENAI_API_KEY": os.environ.get("BIFROST_RUN_VK_1", ""),
           "TAVILY_API_KEY": os.environ.get("TAVILY_API_KEY", ""), "NO_PROXY": "*", "no_proxy": "*"}
    with BATCH_LOCK:
        if any(b["status"].status == "running" for b in BATCHES.values()) or not BRIEF_LOCK.acquire(blocking=False):
            raise HTTPException(409, "another run is running")
    t0 = time.monotonic()

    def failed(error):
        message = str(error)
        for key in (env["OPENAI_API_KEY"], env["TAVILY_API_KEY"]):
            if key:
                message = message.replace(key, "[redacted]")
        rec.status = "error"
        rec.steps = [Step(i=1, t=time.monotonic() - t0, kind="error", detail=runner.KEY_RE.sub("[redacted]", message)[:500],
                          model=None, phase="write", tokens=0, cost_usd=0)]
        rec.metrics.steps = 1

    def work():
        previous = {k: os.environ.get(k) for k in env}
        try:
            if not env["OPENAI_API_KEY"] or not env["TAVILY_API_KEY"]:
                raise ValueError("set BIFROST_RUN_VK_1 and TAVILY_API_KEY for live briefings")
            os.environ.update(env)
            # Use the supplied UTC date, which can differ from the user's local meeting date.
            rec.output.text = briefing_agent.brief(req.subject, req.meeting_time, version)
            # Models sometimes bracket URLs without Markdown's link target.
            rec.output.text = re.sub(r"\[(https?://[^\s\]]+)\](?!\()", r"[\1](\1)", rec.output.text)
            rec.status = "done"
            # No frozen pool: leave claims and success ungraded.
            try:
                usage = runner.fetch_usage(env["OPENAI_BASE_URL"], "vk-run-1", rec.started_at)
                cost, by_model, tokens = graders.calculate_cost(usage)
                rec.metrics.cost_usd, rec.metrics.cost_by_model, rec.metrics.tokens = cost, by_model, tokens
                # Live briefs skip the proxy, so the receipt has Bifrost calls only (no search log to read).
                rec.steps = runner._timeline(ROOT / "no-proxy-log", rec.id, rec.started_at, usage, [])
                rec.metrics.steps, rec.metrics.tool_calls = len(rec.steps), sum(s.kind == "llm" for s in rec.steps)
            except Exception:
                pass  # Usage is optional for live briefs, so keep zero cost when unavailable.
        except Exception as error:
            failed(error)
        finally:
            for k, value in previous.items():
                if value is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = value
            try:
                rec.duration_s = time.monotonic() - t0
                store.save(rec)
            finally:
                BRIEF_LOCK.release()

    try:
        store.save(rec)
        threading.Thread(target=work, name=rec.batch_id, daemon=True).start()
    except Exception as error:
        try:
            failed(error)
            rec.duration_s = time.monotonic() - t0
            store.save(rec)
        finally:
            BRIEF_LOCK.release()
    return {"run_id": rec.id}


@app.post("/api/batches")
def create_batch(req: BatchRequest) -> BatchCreated:
    check_passcode(req.passcode)
    if len(set(req.agents)) != len(req.agents):
        raise HTTPException(422, "each agent once")
    task = runner.find_task(req.task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    with BATCH_LOCK:
        if BRIEF_LOCK.locked() or any(b["status"].status == "running" for b in BATCHES.values()):
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
    except Exception as e:
        del BATCHES[bid]  # any failure frees the slot, or every later POST is a 409
        if isinstance(e, (ValueError, RuntimeError)):
            raise HTTPException(422 if isinstance(e, ValueError) else 503, str(e))
        raise
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
        start = max(0, int(request.headers.get("last-event-id", "-1")) + 1)
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
