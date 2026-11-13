import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from agents import briefing_agent as agent
from assay import runner
from test_proxy import launch, wait_up


SOURCES = [
    {"url": "https://one.test", "title": "One", "content": "one", "published_date": "2026-11-12"},
    {"url": "https://two.test", "title": "Two", "content": "two", "published_date": "2026-11-11"},
]
VALID = """## Verified
- Fact [one](https://one.test)
- Fact [two](https://two.test)
## Uncertain
None
## Not found
None
## Open questions
- Ask why
"""


def test_baseline_uses_main_model(monkeypatch):
    calls = []
    monkeypatch.setattr(agent, "search", lambda query: SOURCES)
    monkeypatch.setattr(agent, "complete", lambda model, prompt: calls.append(model) or VALID)
    assert agent.run("baseline", "Brief me on Acme", "2026-11-13") == VALID
    assert calls == [agent.MAIN_MODEL]


def test_cheap_first_keeps_supported_small_draft(monkeypatch):
    calls = []
    monkeypatch.setattr(agent, "search", lambda query: SOURCES)

    def complete(model, prompt):
        calls.append(model)
        return VALID if len(calls) == 1 else "SUPPORTED"

    monkeypatch.setattr(agent, "complete", complete)
    assert agent.run("cheap-first", "Brief me on Acme", "2026-11-13") == VALID
    assert calls == [agent.SMALL_MODEL, agent.SMALL_MODEL]


def test_cheap_first_switches_at_most_once(monkeypatch):
    calls = []
    monkeypatch.setattr(agent, "search", lambda query: SOURCES)

    def complete(model, prompt):
        calls.append(model)
        return "bad draft" if len(calls) == 1 else VALID

    monkeypatch.setattr(agent, "complete", complete)
    assert agent.run("cheap-first", "Brief me on Acme", "2026-11-13") == VALID
    assert calls == [agent.SMALL_MODEL, agent.MAIN_MODEL]


def test_cheap_first_checks_sources_per_factual_section(monkeypatch):
    draft = VALID.replace("None\n## Not found", "- Weak [one](https://one.test)\n## Not found")
    calls = []
    monkeypatch.setattr(agent, "search", lambda query: SOURCES)
    monkeypatch.setattr(agent, "complete", lambda model, prompt: calls.append(model) or draft)
    agent.run("cheap-first", "Brief me on Acme", "2026-11-13")
    assert calls == [agent.SMALL_MODEL, agent.MAIN_MODEL]


def test_evidence_gate_gets_one_extra_search_and_revision(monkeypatch):
    searches, calls = [], []

    def search(query):
        searches.append(query)
        return SOURCES[:1] if len(searches) == 1 else SOURCES[1:]

    answers = iter([VALID, json.dumps(["- Fact [one](https://one.test)"]), VALID, "[]"])
    monkeypatch.setattr(agent, "search", search)
    monkeypatch.setattr(agent, "complete", lambda model, prompt: calls.append(model) or next(answers))
    assert agent.run("evidence-gated", "Brief me on Acme", "2026-11-13") == VALID
    assert len(searches) == 2
    assert calls == [agent.MAIN_MODEL] * 4


def test_evidence_gate_searches_each_claim_once_and_moves_unresolved(monkeypatch):
    first = VALID.replace("- Fact [two](https://two.test)", "- Bad claim [two](https://two.test)")
    checks = json.dumps(["- Fact [one](https://one.test)", "- Bad claim [two](https://two.test)"])
    answers = iter([first, checks, first, json.dumps(["- Bad claim [two](https://two.test)"])])
    searches = []
    monkeypatch.setattr(agent, "search", lambda query: searches.append(query) or SOURCES)
    monkeypatch.setattr(agent, "complete", lambda model, prompt: next(answers))
    result = agent.run("evidence-gated", "Brief me on Acme", "2026-11-13")
    assert searches == ["Brief me on Acme", "- Fact [one](https://one.test)", "- Bad claim [two](https://two.test)"]
    assert "- Bad claim" not in result
    assert "1 drafted claim(s) could not be verified" in result


def test_fact_answer_does_not_require_briefing_sections(monkeypatch):
    monkeypatch.setattr(agent, "search", lambda query: SOURCES)
    monkeypatch.setattr(agent, "complete", lambda model, prompt: "1582")
    assert agent.run("cheap-first", "In what year was it chartered?", "2026-11-13") == "1582"


def test_live_brief_builds_contract_task(monkeypatch):
    seen = []
    monkeypatch.setattr(agent, "run", lambda version, task, as_of: seen.append((version, task, as_of)) or "brief")
    assert agent.brief("Acme", "2026-11-20T09:00:00Z", "evidence-gated") == "brief"
    assert seen == [("evidence-gated", "Brief me on Acme for a meeting on 2026-11-20T09:00:00Z", "2026-11-20")]


def test_runner_discovers_all_three_agents():
    for name in ("briefing-baseline", "briefing-cheap-first", "briefing-evidence-gated"):
        directory, metadata = runner.find_agent(name)
        assert directory.name == name
        assert metadata["version"] == "1.0" and metadata["prompt_hash"] == "3a2a75be"


@pytest.mark.parametrize("version", ("baseline", "cheap-first", "evidence-gated"))
def test_agent_runs_through_contract_and_frozen_proxy(tmp_path, version):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.dumps({"choices": [{"message": {"content": "2008"}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    process, port, ca, _, proxy_out = launch(tmp_path)
    try:
        wait_up(process, port, ca, tmp_path)
        directory, metadata = runner.find_agent(f"briefing-{version}")
        task = runner.find_task("practice-python3-year")
        result = runner.run_once(
            directory, task, agent_version=metadata["version"], models=metadata["models"],
            prompt_hash=metadata["prompt_hash"], openai_base_url=f"http://127.0.0.1:{server.server_port}/v1",
            openai_api_key="sk-bf-test", https_proxy=f"http://127.0.0.1:{port}", ca_cert=str(ca),
        )
        assert result.status == "done" and result.output.text.strip() == "2008"
    finally:
        process.kill()
        process.wait()
        proxy_out.close()
        server.shutdown()

