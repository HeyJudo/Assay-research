import json
import os
import subprocess
import time
import sys
from pathlib import Path

import pytest
from test_proxy import POOL, launch, wait_up

from assay import runner, store
from assay.models import RunRecord, Task

BACKEND = Path(__file__).resolve().parents[1]
STUB = BACKEND / "agents" / "stub"
PRACTICE = BACKEND.parent / "data" / "practice" / "tasks" / "practice-python3-year.json"
CFG = dict(agent_version="0.1", models=["stub"], prompt_hash="stub")
TASK = Task(id="t1", type="fact", prompt="What is 2+2?", as_of_date="2026-01-02",
            answer="4", trap_twin=None, notes="")


def make_agent(tmp_path, body):
    d = tmp_path / "fake"
    d.mkdir()
    (d / "run").write_text("#!/usr/bin/env python3\nimport os, sys, json, time\n" + body)
    (d / "run").chmod(0o755)
    return d


def test_command_rewrites_python_shebang_only_on_windows(tmp_path, monkeypatch):
    run = make_agent(tmp_path, "pass\n") / "run"
    monkeypatch.setattr(runner.os, "name", "posix")
    assert runner._command(run) == [str(run)]
    monkeypatch.setattr(runner.os, "name", "nt")
    assert runner._command(run) == [sys.executable, str(run)]


def test_stub_success():
    rec = runner.run_once(STUB, TASK, **CFG)
    RunRecord.model_validate(rec.model_dump())
    assert rec.status == "done"
    assert "https://example.com/pool/stub-source" in rec.output.text
    assert "What is 2+2?" in rec.output.text
    assert rec.agent_id == "stub" and rec.task_id == "t1"
    assert rec.steps == [] and rec.claims == []


def test_env_routing_and_allowlist(tmp_path, monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "parent-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "parent-openai")
    agent = make_agent(tmp_path, "open(os.environ['ASSAY_OUTPUT'],'w').write(json.dumps(dict(os.environ)))\n")
    rec = runner.run_once(agent, TASK, **CFG)
    env = json.loads(rec.output.text)
    assert env["ASSAY_TASK"] == "What is 2+2?"
    assert env["ASSAY_AS_OF"] == "2026-01-02"
    assert env["ASSAY_OUTPUT"]
    assert env["TAVILY_API_KEY"] == "" and env["OPENAI_API_KEY"] == ""

    rec = runner.run_once(agent, TASK, **CFG, openai_base_url="http://b/v1", openai_api_key="k",
                          https_proxy="http://p:1", ca_cert="/ca.pem")
    env = json.loads(rec.output.text)
    assert env["OPENAI_BASE_URL"] == "http://b/v1"
    assert env["OPENAI_API_KEY"] == "k"
    assert env["HTTPS_PROXY"] == env["HTTP_PROXY"] == f"http://{rec.id}:x@p:1"
    assert env["NO_PROXY"] == "localhost,127.0.0.1"
    assert env["SSL_CERT_FILE"] == "/ca.pem"
    assert env["REQUESTS_CA_BUNDLE"] == "/ca.pem"
    assert env["TAVILY_API_KEY"] == ""


def test_dotenv_cannot_fill_blanked_keys(tmp_path):
    (tmp_path / ".env").write_text("TAVILY_API_KEY=sentinel-from-dotenv\n")
    d = tmp_path / "backend" / "agents" / "dotenv-agent"
    d.mkdir(parents=True)
    (d / "run").write_text("#!/usr/bin/env python3\nfrom dotenv import load_dotenv; load_dotenv()\nimport os\n"
                           "open(os.environ['ASSAY_OUTPUT'],'w').write(os.environ.get('TAVILY_API_KEY','<unset>'))\n")
    (d / "run").chmod(0o755)
    rec = runner.run_once(d, TASK, **CFG, openai_api_key="k")
    assert rec.status == "done" and rec.output.text == ""


def test_nonzero_exit(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "sys.stderr.write('boom')\nsys.exit(3)\n"), TASK, **CFG)
    assert rec.status == "error" and rec.output.text == ""
    assert rec.steps[0].kind == "error"
    assert "exit 3" in rec.steps[0].detail and "boom" in rec.steps[0].detail


def test_missing_output(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "pass\n"), TASK, **CFG)
    assert rec.status == "error"
    assert rec.steps[0].detail == "no output file"


def test_non_utf8_bytes(tmp_path):
    body = ("import os, sys\nopen(os.environ['ASSAY_OUTPUT'], 'wb').write(b'ok \\xff')\n"
            "sys.stderr.buffer.write(b'bad \\xff')\nsys.exit(0)\n")
    rec = runner.run_once(make_agent(tmp_path, body), TASK, **CFG)
    assert rec.status == "done"
    assert rec.output.text == "ok \ufffd"


def test_missing_run_command(tmp_path):
    rec = runner.run_once(tmp_path, TASK, **CFG)  # folder exists, no `run` inside
    assert rec.status == "error"
    assert rec.steps[0].detail.startswith("cannot start:")


def test_timeout(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "time.sleep(30)\n"), TASK, **CFG, timeout_s=1)
    assert rec.status == "error"
    assert rec.steps[0].detail == "timeout after 1s"
    assert rec.duration_s < 10


def test_cli(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    monkeypatch.setenv("ASSAY_DB", str(db))
    out = subprocess.run(
        [sys.executable, "-m", "assay.runner", "--agent", str(STUB), "--task", str(PRACTICE),
         "--agent-version", "0.1", "--models", "a,b", "--prompt-hash", "h"],
        cwd=BACKEND, env={**__import__("os").environ, "ASSAY_DB": str(db)},
        capture_output=True, text=True, check=True)
    rec = store.get(out.stdout.strip())
    assert rec is not None and rec.status == "done"


def test_timeout_kills_grandchild(tmp_path):
    marker = tmp_path / "marker"
    body = ("import subprocess\n"
            "subprocess.Popen([sys.executable, '-c', 'import sys, time; time.sleep(3); open(sys.argv[1], \"w\").write(\"x\")', "
            f"{str(marker)!r}])\n"
            "time.sleep(30)\n")
    rec = runner.run_once(make_agent(tmp_path, body), TASK, **CFG, timeout_s=1)
    assert rec.status == "error"
    assert rec.duration_s < 10
    time.sleep(5)
    assert not marker.exists()


def test_cwd_is_outside_repo(tmp_path):
    agent = make_agent(tmp_path, "open(os.environ['ASSAY_OUTPUT'], 'w').write(os.getcwd())\n")
    rec = runner.run_once(agent, TASK, **CFG)
    cwd = Path(rec.output.text).resolve()
    assert not cwd.is_relative_to(Path(runner.__file__).resolve().parents[2])
    assert cwd != agent.resolve()


@pytest.mark.parametrize("field", ["agent_version", "models", "prompt_hash"])
def test_config_required(field):
    with pytest.raises(ValueError):
        runner.run_once(STUB, TASK, **{**CFG, field: "" if field != "models" else []})


def test_config_recorded():
    rec = runner.run_once(STUB, TASK, agent_version="9", models=["m1", "m2"], prompt_hash="abc")
    assert (rec.config.agent_version, rec.config.models, rec.config.prompt_hash) == ("9", ["m1", "m2"], "abc")


def test_cli_agent_key_from_env(tmp_path, monkeypatch):
    agent = make_agent(tmp_path, "open(os.environ['ASSAY_OUTPUT'], 'w').write(os.environ.get('OPENAI_API_KEY', 'missing'))\n")
    db = tmp_path / "t.db"
    monkeypatch.setenv("ASSAY_DB", str(db))
    out = subprocess.run(
        [sys.executable, "-m", "assay.runner", "--agent", str(agent), "--task", str(PRACTICE),
         "--agent-version", "0.1", "--models", "a", "--prompt-hash", "h"],
        cwd=BACKEND, env={**os.environ, "ASSAY_DB": str(db), "ASSAY_AGENT_API_KEY": "sk-bf-virtual"},
        capture_output=True, text=True, check=True)
    assert store.get(out.stdout.strip()).output.text == "sk-bf-virtual"


def test_stderr_keys_redacted(tmp_path):
    secrets = ["sk-bf-abc123", "tvly-XYZ", "gsk_q", "AIzaSyQ", "csk-9", "sk-proj-77"]
    body = f"sys.stderr.write({' '.join(secrets)!r})\nsys.exit(1)\n"
    rec = runner.run_once(make_agent(tmp_path, body), TASK, **CFG)
    detail = rec.steps[0].detail
    assert "[redacted]" in detail
    assert not any(s in detail for s in secrets)


def test_surviving_grandchild_does_not_lose_record(tmp_path):
    marker = tmp_path / "marker"
    body = ("open(os.environ['ASSAY_OUTPUT'], 'w').write('ok')\n"
            "import subprocess\n"
            "subprocess.Popen([sys.executable, '-c', 'import sys, time; time.sleep(2); open(sys.argv[1], \"w\").write(\"x\")', "
            f"{str(marker)!r}])\n")
    rec = runner.run_once(make_agent(tmp_path, body), TASK, **CFG)
    assert rec.status == "done"
    time.sleep(3)
    if os.name != "nt":
        assert not marker.exists()


def test_redaction_keeps_words_and_hides_literal_key(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "sys.stderr.write('task-123 risk-free')\nsys.exit(1)\n"), TASK, **CFG)
    assert "task-123" in rec.steps[0].detail and "risk-free" in rec.steps[0].detail


def test_literal_agent_key_redacted(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "sys.stderr.write('key plainsecret123 end')\nsys.exit(1)\n"),
                          TASK, **CFG, openai_api_key="plainsecret123")
    assert "plainsecret123" not in rec.steps[0].detail
    assert "[redacted]" in rec.steps[0].detail


def test_empty_model_name_rejected():
    with pytest.raises(ValueError):
        runner.run_once(STUB, TASK, **{**CFG, "models": ["a", ""]})


def test_cli_drops_empty_models(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    monkeypatch.setenv("ASSAY_DB", str(db))
    out = subprocess.run(
        [sys.executable, "-m", "assay.runner", "--agent", str(STUB), "--task", str(PRACTICE),
         "--agent-version", "0.1", "--models", "a,,b", "--prompt-hash", "h"],
        cwd=BACKEND, env={**os.environ, "ASSAY_DB": str(db)}, capture_output=True, text=True, check=True)
    assert store.get(out.stdout.strip()).config.models == ["a", "b"]


def test_runner_through_real_proxy(tmp_path):
    p, port, ca, log, out = launch(tmp_path)
    try:
        wait_up(p, port, ca, tmp_path)
        ops = [{"op": "search", "arg": "free threaded build"}, {"op": "fetch", "arg": "http://not-in-pool.invalid/x"}]
        task = TASK.model_copy(update={"prompt": json.dumps(ops)})
        rec = runner.run_once(BACKEND / "tests" / "agents" / "searcher", task, **CFG,
                              https_proxy=f"http://127.0.0.1:{port}", ca_cert=str(ca))
        assert rec.status == "done", rec.steps
        assert json.loads(rec.output.text) == [200, 404]
        lines = [json.loads(x) for x in log.read_text().splitlines()]
        assert [x["kind"] for x in lines] == ["search", "fetch"]
        assert {x["run_id"] for x in lines} == {rec.id}
    finally:
        p.kill()
        p.wait()
        out.close()
