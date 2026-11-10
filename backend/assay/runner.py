"""Runs one agent on one task (PRD §8 agent contract) and returns a RunRecord."""

import argparse
import os
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from assay import store
from assay.models import RunConfig, RunMetrics, RunOutput, RunRecord, Step, Task

# Allowlist, not os.environ: the parent holds the real judge and provider keys.
OS_BASICS = ["PATH", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE", "LANG", "LC_ALL"]


def _command(run: Path) -> list[str]:
    # ponytail: Windows can't exec shebangs, so python shebangs go through our interpreter. Outside agents get a shell wrapper.
    first = run.read_text(encoding="utf-8", errors="ignore").splitlines()[:1]
    if first and first[0].startswith("#!") and "python" in first[0]:
        return [sys.executable, str(run)]
    return [str(run)]


def run_once(agent_dir: Path, task: Task, *, openai_base_url=None, openai_api_key=None,
             https_proxy=None, ca_cert=None, timeout_s: float = 600, batch_id: str | None = None,
             repeat: int = 1, trap=None, trap_seed=None, pool_version="v1") -> RunRecord:
    started = datetime.now(timezone.utc)
    env = {k: os.environ[k] for k in OS_BASICS if k in os.environ}
    env.update(ASSAY_TASK=task.prompt, ASSAY_AS_OF=task.as_of_date)
    for k, v in {"OPENAI_BASE_URL": openai_base_url, "OPENAI_API_KEY": openai_api_key,
                 "HTTPS_PROXY": https_proxy, "SSL_CERT_FILE": ca_cert, "REQUESTS_CA_BUNDLE": ca_cert}.items():
        if v:
            env[k] = v

    text, error = "", None
    t0 = time.monotonic()
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "output.md"
        env["ASSAY_OUTPUT"] = str(out)
        try:
            # ponytail: timeout kills the direct child only. Use start_new_session+killpg when wrapped agents spawn children.
            p = subprocess.run(_command(agent_dir / "run"), cwd=agent_dir, env=env,
                               capture_output=True, encoding="utf-8", errors="replace", timeout=timeout_s)
            if p.returncode != 0:
                error = f"exit {p.returncode}: {p.stderr[-500:]}"
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
        id=f"run_{uuid.uuid4().hex[:12]}", batch_id=batch_id or f"b_{uuid.uuid4().hex[:12]}",
        agent_id=agent_dir.name, task_id=task.id, task_type=task.type, trap=trap, repeat=repeat,
        status="error" if error else "done",
        started_at=started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z", duration_s=duration,
        # ponytail: filled from agent metadata when the batch runner lands.
        config=RunConfig(agent_version="", models=[], prompt_hash="", pool_version=pool_version,
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
    ap.add_argument("--openai-base-url")
    ap.add_argument("--openai-api-key")
    ap.add_argument("--https-proxy")
    ap.add_argument("--ca-cert")
    ap.add_argument("--timeout", type=float, default=600)
    a = ap.parse_args()
    rec = run_once(a.agent.resolve(), Task.model_validate_json(a.task.read_text(encoding="utf-8")),
                   openai_base_url=a.openai_base_url, openai_api_key=a.openai_api_key,
                   https_proxy=a.https_proxy, ca_cert=a.ca_cert, timeout_s=a.timeout)
    store.save(rec)
    print(rec.id)
