import json
import subprocess
import sys
from pathlib import Path

import pytest

from assay import runner, store
from assay.models import RunRecord, Task

BACKEND = Path(__file__).resolve().parents[1]
STUB = BACKEND / "agents" / "stub"
PRACTICE = BACKEND.parent / "data" / "practice" / "tasks" / "practice-python3-year.json"
TASK = Task(id="t1", type="fact", prompt="What is 2+2?", as_of_date="2026-01-02",
            answer="4", trap_twin=None, notes="")


def make_agent(tmp_path, body):
    d = tmp_path / "fake"
    d.mkdir()
    (d / "run").write_text("#!/usr/bin/env python3\nimport os, sys, json, time\n" + body)
    return d


def test_stub_success():
    rec = runner.run_once(STUB, TASK)
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
    rec = runner.run_once(agent, TASK)
    env = json.loads(rec.output.text)
    assert env["ASSAY_TASK"] == "What is 2+2?"
    assert env["ASSAY_AS_OF"] == "2026-01-02"
    assert env["ASSAY_OUTPUT"]
    assert "TAVILY_API_KEY" not in env and "OPENAI_API_KEY" not in env

    rec = runner.run_once(agent, TASK, openai_base_url="http://b/v1", openai_api_key="k",
                          https_proxy="http://p:1", ca_cert="/ca.pem")
    env = json.loads(rec.output.text)
    assert env["OPENAI_BASE_URL"] == "http://b/v1"
    assert env["OPENAI_API_KEY"] == "k"
    assert env["HTTPS_PROXY"] == "http://p:1"
    assert env["SSL_CERT_FILE"] == "/ca.pem"
    assert env["REQUESTS_CA_BUNDLE"] == "/ca.pem"
    assert "TAVILY_API_KEY" not in env


def test_nonzero_exit(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "sys.stderr.write('boom')\nsys.exit(3)\n"), TASK)
    assert rec.status == "error" and rec.output.text == ""
    assert rec.steps[0].kind == "error"
    assert "exit 3" in rec.steps[0].detail and "boom" in rec.steps[0].detail


def test_missing_output(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "pass\n"), TASK)
    assert rec.status == "error"
    assert rec.steps[0].detail == "no output file"


def test_non_utf8_bytes(tmp_path):
    body = ("import os, sys\nopen(os.environ['ASSAY_OUTPUT'], 'wb').write(b'ok \\xff')\n"
            "sys.stderr.buffer.write(b'bad \\xff')\nsys.exit(0)\n")
    rec = runner.run_once(make_agent(tmp_path, body), TASK)
    assert rec.status == "done"
    assert rec.output.text == "ok \ufffd"


def test_missing_run_command(tmp_path):
    rec = runner.run_once(tmp_path, TASK)  # folder exists, no `run` inside
    assert rec.status == "error"
    assert rec.steps[0].detail.startswith("cannot start:")


def test_timeout(tmp_path):
    rec = runner.run_once(make_agent(tmp_path, "time.sleep(30)\n"), TASK, timeout_s=1)
    assert rec.status == "error"
    assert rec.steps[0].detail == "timeout after 1s"
    assert rec.duration_s < 10


def test_cli(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    monkeypatch.setenv("ASSAY_DB", str(db))
    out = subprocess.run(
        [sys.executable, "-m", "assay.runner", "--agent", str(STUB), "--task", str(PRACTICE)],
        cwd=BACKEND, env={**__import__("os").environ, "ASSAY_DB": str(db)},
        capture_output=True, text=True, check=True)
    rec = store.get(out.stdout.strip())
    assert rec is not None and rec.status == "done"
