import json
import os
import subprocess

from assay import runner
from assay.models import Task

AGENT = runner.AGENTS_DIR / "gpt-researcher"
TASK = Task(id="t1", type="fact", prompt="Q?", as_of_date="2026-01-02", answer="a", trap_twin=None, notes="")

# Stands in for the library (the outer boundary): records the env it was configured with.
FAKE = '''
import json, os
class GPTResearcher:
    def __init__(self, query, **kw):
        self.query = query
        self.env = {k: os.environ.get(k) for k in ("RETRIEVER", "FAST_LLM", "SMART_LLM", "STRATEGIC_LLM",
                    "ALLOW_PRIVATE_URLS", "TAVILY_API_KEY", "OPENAI_BASE_URL", "OPENAI_API_KEY", "HTTPS_PROXY")}
    async def conduct_research(self): pass
    async def write_report(self): return json.dumps({"query": self.query, "env": self.env})
'''


def test_agent_is_discoverable_with_lf_run():
    found = runner.find_agent("gpt-researcher")
    assert found and all(found[1][k] for k in ("version", "models", "prompt_hash"))
    assert b"\r" not in (AGENT / "run").read_bytes()


def test_wrapper_routes_by_env_only(tmp_path):
    (tmp_path / "gpt_researcher.py").write_text(FAKE, encoding="utf-8")
    out = tmp_path / "out.md"
    env = {**os.environ, "PYTHONPATH": str(tmp_path), "ASSAY_TASK": "Q?", "ASSAY_AS_OF": "2026-01-02",
           "ASSAY_OUTPUT": str(out), "TAVILY_API_KEY": "", "OPENAI_BASE_URL": "http://bifrost/v1",
           "OPENAI_API_KEY": "sk-bf-run", "HTTPS_PROXY": "http://run:none@127.0.0.1:1"}
    subprocess.run(runner._command(AGENT / "run"), env=env, check=True)
    got = json.loads(out.read_text(encoding="utf-8"))
    model = json.loads((AGENT / "agent.json").read_text(encoding="utf-8"))["models"][0]
    assert got["query"] == "Q?\n\nAnswer as of 2026-01-02."
    assert got["env"] == {"RETRIEVER": "tavily", "FAST_LLM": f"openai:{model}", "SMART_LLM": f"openai:{model}",
                          "STRATEGIC_LLM": f"openai:{model}", "ALLOW_PRIVATE_URLS": "true",
                          "TAVILY_API_KEY": "assay-proxy", "OPENAI_BASE_URL": "http://bifrost/v1",
                          "OPENAI_API_KEY": "sk-bf-run", "HTTPS_PROXY": "http://run:none@127.0.0.1:1"}
