"""Runs one agent on one task (PRD §8 agent contract) and returns a RunRecord."""

import argparse
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from assay import store
from assay.models import RunConfig, RunMetrics, RunOutput, RunRecord, Step, Task

# Allowlist, not os.environ: the parent holds the real judge and provider keys.
OS_BASICS = ["PATH", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG", "LC_ALL"]

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
             repeat: int = 1, trap=None, trap_seed=None, pool_version="v1") -> RunRecord:
    if not (agent_version and models and prompt_hash) or not all(m.strip() for m in models):
        raise ValueError("agent_version, models and prompt_hash are required")
    rid = f"run_{uuid.uuid4().hex[:12]}"
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
        # The proxy tells runs apart by this userinfo (password is a dummy so clients send Basic auth).
        u = urlsplit(https_proxy)
        env["HTTPS_PROXY"] = env["HTTP_PROXY"] = urlunsplit(u._replace(netloc=f"{rid}:x@{u.netloc.rpartition('@')[2]}"))
        env["NO_PROXY"] = "localhost,127.0.0.1"

    text, error = "", None
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
            if p.returncode != 0:
                stderr = (Path(tmp) / "stderr").read_text(encoding="utf-8", errors="replace")
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
    return RunRecord(
        id=rid, batch_id=batch_id or f"b_{uuid.uuid4().hex[:12]}",
        agent_id=agent_dir.name, task_id=task.id, task_type=task.type, trap=trap, repeat=repeat,
        status="error" if error else "done",
        started_at=started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z", duration_s=duration,
        config=RunConfig(agent_version=agent_version, models=models, prompt_hash=prompt_hash, pool_version=pool_version,
                         trap_seed=trap_seed, fallback_used=False),
        # ponytail: the grader decides abstained.
        output=RunOutput(text=text, abstained=False),
        # ponytail: steps come from proxy+Bifrost logs and claims from the judge, in later tasks.
        steps=steps, claims=[],
        # ponytail: graders fill metrics.
        metrics=RunMetrics(success=False, steps=0, tool_calls=0, tokens=0, cost_usd=0,
                           cost_by_model={}, switched=False, trap_fell=False,
                           abstention=None, claims_supported_pct=None))


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
    a = ap.parse_args()
    rec = run_once(a.agent.resolve(), Task.model_validate_json(a.task.read_text(encoding="utf-8")),
                   agent_version=a.agent_version, models=[m.strip() for m in a.models.split(",") if m.strip()], prompt_hash=a.prompt_hash,
                   openai_base_url=a.openai_base_url, openai_api_key=os.environ.get("ASSAY_AGENT_API_KEY"),
                   https_proxy=a.https_proxy, ca_cert=a.ca_cert, timeout_s=a.timeout)
    store.save(rec)
    print(rec.id)
