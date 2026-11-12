"""Runs one agent on one task (PRD §8 agent contract) and returns a RunRecord. start_batch runs a batch in parallel."""

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import get_args
from urllib.parse import urlsplit, urlunsplit

from assay import store
from assay.models import (BatchDoneEvent, RunConfig, RunDoneEvent, RunMetrics, RunOutput, RunRecord, RunStartedEvent,
                          Step, StepEvent, Task, Trap)

BACKEND = Path(__file__).resolve().parents[1]
DATA = BACKEND.parent / "data"
AGENTS_DIR = BACKEND / "agents"  # one folder per agent id: `run` + agent.json {"version", "models", "prompt_hash"}
TASK_DIRS = [DATA / "tasks", DATA / "practice" / "tasks"]
POOL_DIRS = [DATA / "pools", DATA / "practice" / "pools"]
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")
REPEATS = 3  # PRD §13

# Must match PROXY_TRAPS in proxy.py. model_outage is handled by outage.py, not the search proxy.
PROXY_TRAPS = {"fake_article", "hidden_instruction", "search_outage"}

# Allowlist, not os.environ: the parent holds the real judge and provider keys.
OS_BASICS = ["PATH", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG", "LC_ALL"]

# Bifrost answers 402 {"type": "budget_exceeded"} once a run-slot virtual key's budget is spent.
BUDGET_RE = re.compile(r"budget[_ ]exceeded", re.I)
KEY_RE = re.compile(r"(?<![A-Za-z0-9])(?:sk-bf-|sk-|tvly-|gsk_|AIza|csk-)[A-Za-z0-9_\-]+")


def _command(run: Path) -> list[str]:
    # ponytail: Windows can't exec shebangs, so python shebangs go through our interpreter. Elsewhere exec directly so the agent's own venv shebang is honored.
    if os.name != "nt":
        return [str(run)]
    first = run.read_text(encoding="utf-8", errors="ignore").splitlines()[:1]
    if first and first[0].startswith("#!") and "python" in first[0]:
        return [sys.executable, str(run)]
    return [str(run)]


def run_once(agent_dir: Path, task: Task, *, agent_version: str, models: list[str], prompt_hash: str,
             openai_base_url=None, openai_api_key=None,
             https_proxy=None, ca_cert=None, timeout_s: float = 600, batch_id: str | None = None,
             repeat: int = 1, trap=None, trap_seed=None, pool_version="v1",
             llm_outage_url=None, on_start=None) -> RunRecord:
    """on_start(record) is called with the `running` record just before the agent starts."""
    if not (agent_version and models and prompt_hash) or not all(m.strip() for m in models):
        raise ValueError("agent_version, models and prompt_hash are required")
    if trap is not None and trap not in get_args(Trap):
        raise ValueError(f"unknown trap {trap!r}")
    if trap in PROXY_TRAPS and not https_proxy:
        raise ValueError(f"{trap} needs https_proxy: the proxy enforces it")
    if trap == "model_outage" and not (llm_outage_url and openai_base_url):
        raise ValueError("model_outage needs llm_outage_url and openai_base_url")
    rid = f"run_{uuid.uuid4().hex[:12]}"
    if trap == "model_outage":  # the add-on keys its per-run 503 count on /r/<rid>
        openai_base_url = f"{llm_outage_url.rstrip('/')}/r/{rid}{urlsplit(openai_base_url).path}"
    started = datetime.now(timezone.utc)
    env = {k: os.environ[k] for k in OS_BASICS if k in os.environ}
    # Blank every .env.example name so load_dotenv(override=False) in the agent can't fill real keys from the repo-root .env.
    try:
        for line in (Path(__file__).resolve().parents[2] / ".env.example").read_text(encoding="utf-8").splitlines():
            name = line.partition("=")[0].strip()
            if name and not name.startswith("#") and "=" in line:
                env.setdefault(name, "")
    except OSError:  # the Docker image doesn't ship .env.example
        pass
    env.update(ASSAY_TASK=task.prompt, ASSAY_AS_OF=task.as_of_date)
    for k, v in {"OPENAI_BASE_URL": openai_base_url, "OPENAI_API_KEY": openai_api_key,
                 "SSL_CERT_FILE": ca_cert, "REQUESTS_CA_BUNDLE": ca_cert}.items():
        if v:
            env[k] = v
    if https_proxy:
        # The proxy tells runs apart by the username and checks the password (the run's proxy trap) against its own.
        u = urlsplit(https_proxy)
        tag = trap if trap in PROXY_TRAPS else "none"
        proxy = urlunsplit(u._replace(netloc=f"{rid}:{tag}@{u.netloc.rpartition('@')[2]}"))
        # Lowercase too: curl only reads lowercase http_proxy.
        for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
            env[k] = proxy
        # Bifrost's host skips the proxy too: in Docker it is "bifrost", not localhost.
        local = ["localhost", "127.0.0.1", urlsplit(openai_base_url or "").hostname]
        env["NO_PROXY"] = env["no_proxy"] = ",".join(dict.fromkeys(h for h in local if h))

    base = RunRecord(
        id=rid, batch_id=batch_id or f"b_{uuid.uuid4().hex[:12]}",
        agent_id=agent_dir.name, task_id=task.id, task_type=task.type, trap=trap, repeat=repeat,
        status="running", started_at=started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z", duration_s=None,
        config=RunConfig(agent_version=agent_version, models=models, prompt_hash=prompt_hash, pool_version=pool_version,
                         trap_seed=trap_seed, fallback_used=False),
        # ponytail: the grader decides abstained.
        output=RunOutput(text="", abstained=False),
        # ponytail: steps come from proxy+Bifrost logs and claims from the judge, in later tasks.
        steps=[], claims=[],
        # ponytail: graders fill metrics.
        metrics=RunMetrics(success=False, steps=0, tool_calls=0, tokens=0, cost_usd=0,
                           cost_by_model={}, switched=False, trap_fell=False,
                           abstention=None, claims_supported_pct=None))
    if on_start:
        on_start(base)

    text, error, budget = "", None, False
    t0 = time.monotonic()
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        out = Path(tmp) / "output.md"
        env["ASSAY_OUTPUT"] = str(out)
        try:
            # Files, not pipes: a surviving grandchild can't hold a pipe open and block us.
            with open(Path(tmp) / "stdout", "wb") as so, open(Path(tmp) / "stderr", "wb") as se:
                if os.name == "nt":
                    flags = dict(creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
                else:
                    flags = dict(start_new_session=True)
                p = subprocess.Popen(_command(agent_dir.resolve() / "run"), cwd=tmp, env=env,
                                     stdin=subprocess.DEVNULL, stdout=so, stderr=se, **flags)
                try:
                    p.wait(timeout=timeout_s)
                finally:
                    # Always kill the tree: a surviving grandchild must not outlive the run.
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
                    else:
                        try:
                            os.killpg(p.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    if p.poll() is None:
                        p.wait(timeout=10)
            stderr = (Path(tmp) / "stderr").read_text(encoding="utf-8", errors="replace")
            # ponytail: stderr match, misses an agent that swallows the 402 silently
            budget = bool(BUDGET_RE.search(stderr))
            if p.returncode != 0:
                if openai_api_key:
                    stderr = stderr.replace(openai_api_key, "[redacted]")
                error = f"exit {p.returncode}: {KEY_RE.sub('[redacted]', stderr)[-500:]}"
            elif not out.exists():
                error = "no output file"
            else:
                text = out.read_text(encoding="utf-8", errors="replace")
        except subprocess.TimeoutExpired:
            error = f"timeout after {timeout_s:g}s"
        except OSError as e:  # no `run`, not executable, bad interpreter
            error = f"cannot start: {e}"
    duration = time.monotonic() - t0

    steps = [Step(i=1, t=duration, kind="error", detail=error, model=None, phase="write",
                  tokens=0, cost_usd=0)] if error else []
    status = "budget_exceeded" if budget else "error" if error else "done"
    return base.model_copy(update=dict(status=status, duration_s=duration, output=RunOutput(text=text, abstained=False),
                                       steps=steps))


def find_agent(agent_id: str) -> tuple[Path, dict] | None:
    d = AGENTS_DIR / agent_id
    if not SAFE_ID.fullmatch(agent_id) or not (d / "run").is_file() or not (d / "agent.json").is_file():
        return None
    return d, json.loads((d / "agent.json").read_text("utf-8"))


def find_task(task_id: str) -> Task | None:
    for d in TASK_DIRS if SAFE_ID.fullmatch(task_id) else []:
        if (d / f"{task_id}.json").is_file():
            return Task.model_validate_json((d / f"{task_id}.json").read_text("utf-8"))
    return None


def find_pool(task_id: str) -> Path | None:
    for d in POOL_DIRS if SAFE_ID.fullmatch(task_id) else []:
        if (d / f"{task_id}.json").is_file():
            return d / f"{task_id}.json"
    return None


def _mitmdump(tmp: Path, script: str, args: list[str], env: dict) -> tuple[subprocess.Popen, int]:
    """Start one of our mitmproxy add-ons on a free local port and wait until it listens."""
    with socket.socket() as s:  # ponytail: port can be taken between close and bind, retry the batch if so
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    out = tmp / f"{script}.out"
    with open(out, "wb") as f:
        p = subprocess.Popen([sys.executable, "-c", "from mitmproxy.tools.main import mitmdump; mitmdump()",
                              "-s", str(BACKEND / "assay" / script), "--listen-host", "127.0.0.1",
                              "--listen-port", str(port), "--set", f"confdir={tmp}", *args],
                             cwd=BACKEND, env={**os.environ, **env}, stdout=f, stderr=subprocess.STDOUT)
    for _ in range(300):
        if p.poll() is not None:
            break
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            if (tmp / "mitmproxy-ca-cert.pem").exists():
                return p, port
        except OSError:
            pass
        time.sleep(0.1)
    p.kill()
    p.wait()
    raise RuntimeError(f"{script} did not start: {out.read_text('utf-8', errors='replace')[-500:]}")


def _stop(procs: list[subprocess.Popen], tmp: Path) -> None:
    for p in procs:
        p.kill()
        p.wait()
    shutil.rmtree(tmp, ignore_errors=True)


def start_batch(batch_id: str, agent_ids: list[str], task: Task, trap, *, emit, bifrost_url: str,
                vks: list[str], timeout_s: float = 600) -> threading.Thread:
    """Run each agent REPEATS times on task, all runs in parallel. Run slot n gets vks[n-1] as its Bifrost key.

    Starts the batch's search proxy (task pool + trap) and, for model_outage, the outage pass-through, then
    returns the thread running the batch. emit(name, event) gets the SSE events from PRD §8, batch_done last.
    Raises ValueError on a bad setup and RuntimeError when a proxy will not start, before any run starts."""
    agents = {a: find_agent(a) for a in agent_ids}
    for a, found in agents.items():
        if found is None:
            raise ValueError(f"unknown agent {a}")
        if not all(found[1].get(k) for k in ("version", "models", "prompt_hash")):
            raise ValueError(f"{a}/agent.json needs version, models and prompt_hash")
    jobs = [(a, r) for a in agent_ids for r in range(1, REPEATS + 1)]
    if len(vks) < len(jobs) or not all(vks[:len(jobs)]):
        raise ValueError(f"set BIFROST_RUN_VK_1..{len(jobs)}: one Bifrost key per parallel run")
    pool_file = find_pool(task.id)
    if pool_file is None:
        raise ValueError(f"no pool for task {task.id}")
    pool = json.loads(pool_file.read_text("utf-8"))
    if trap in ("fake_article", "hidden_instruction") and not any(d.get("trap") == trap for d in pool["docs"]):
        raise ValueError(f"pool for {task.id} has no {trap} doc")

    tmp = Path(tempfile.mkdtemp(prefix=f"assay-{batch_id}-"))
    procs = []
    try:
        # ponytail: search log lives in tmp and goes with the batch, keep it when steps are built from it
        p, port = _mitmdump(tmp, "proxy.py", ["--mode", "upstream:http://127.0.0.1:9", "--set", "connection_strategy=lazy",
                                              "--set", "rawtcp=false"],
                            {"ASSAY_POOL_FILE": str(pool_file), "ASSAY_SEARCH_LOG": str(tmp / "search.jsonl"),
                             "ASSAY_TRAP": trap or ""})
        procs.append(p)
        kw = dict(https_proxy=f"http://127.0.0.1:{port}", ca_cert=str(tmp / "mitmproxy-ca-cert.pem"))
        if trap == "model_outage":
            u = urlsplit(bifrost_url)
            p, port = _mitmdump(tmp, "outage.py", ["--mode", f"reverse:{u.scheme}://{u.netloc}"], {})
            procs.append(p)
            kw["llm_outage_url"] = f"http://127.0.0.1:{port}"
    except BaseException:
        _stop(procs, tmp)
        raise

    def one(slot, agent_id, repeat):
        agent_dir, meta = agents[agent_id]

        begun = []

        def started(rec):
            begun.append(rec)
            store.save(rec)
            emit("run_started", RunStartedEvent(run_id=rec.id, batch_id=batch_id, agent_id=agent_id, repeat=repeat,
                                                started_at=rec.started_at))

        try:
            rec = run_once(agent_dir, task, agent_version=meta["version"], models=meta["models"],
                           prompt_hash=meta["prompt_hash"], openai_base_url=bifrost_url, openai_api_key=vks[slot],
                           timeout_s=timeout_s, batch_id=batch_id, repeat=repeat, trap=trap,
                           pool_version=pool["pool_version"], on_start=started, **kw)
        except Exception as e:
            if not begun:
                raise
            # A started run must end, or it stays `running` forever.
            rec = begun[0].model_copy(update=dict(status="error", duration_s=0.0, steps=[Step(
                i=1, t=0, kind="error", detail=f"runner: {e!r}"[:500], model=None, phase="write", tokens=0, cost_usd=0)]))
        store.save(rec)
        # ponytail: steps go out when the run ends, live steps come with the proxy+Bifrost log timeline
        for step in rec.steps:
            emit("step", StepEvent(run_id=rec.id, step=step))
        emit("run_done", RunDoneEvent(run_id=rec.id, status=rec.status, duration_s=rec.duration_s, metrics=rec.metrics))

    def batch():
        try:
            with ThreadPoolExecutor(len(jobs)) as ex:
                futures = [ex.submit(one, i, a, r) for i, (a, r) in enumerate(jobs)]
            for f in futures:
                if f.exception():
                    traceback.print_exception(f.exception())
        finally:
            _stop(procs, tmp)
            emit("batch_done", BatchDoneEvent(batch_id=batch_id))

    t = threading.Thread(target=batch, name=batch_id, daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", required=True, type=Path)
    ap.add_argument("--task", required=True, type=Path)
    ap.add_argument("--agent-version", required=True)
    ap.add_argument("--models", required=True, help="comma-separated")
    ap.add_argument("--prompt-hash", required=True)
    ap.add_argument("--openai-base-url")
    ap.add_argument("--https-proxy")
    ap.add_argument("--ca-cert")
    ap.add_argument("--timeout", type=float, default=600)
    ap.add_argument("--trap", choices=get_args(Trap))
    ap.add_argument("--llm-outage-url")
    a = ap.parse_args()
    rec = run_once(a.agent.resolve(), Task.model_validate_json(a.task.read_text(encoding="utf-8")),
                   agent_version=a.agent_version, models=[m.strip() for m in a.models.split(",") if m.strip()], prompt_hash=a.prompt_hash,
                   openai_base_url=a.openai_base_url, openai_api_key=os.environ.get("ASSAY_AGENT_API_KEY"),
                   https_proxy=a.https_proxy, ca_cert=a.ca_cert, timeout_s=a.timeout,
                   trap=a.trap, llm_outage_url=a.llm_outage_url)
    store.save(rec)
    print(rec.id)
