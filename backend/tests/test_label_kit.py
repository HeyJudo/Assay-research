import json
from collections import Counter
from pathlib import Path

import pytest

from assay import graders, judge_agreement, label_kit, store
from assay.models import Claim, RunRecord

ROOT = Path(__file__).resolve().parents[2]
BASE = next(r for r in json.loads((ROOT / "web/src/fixtures/runs.json").read_text("utf-8"))
            if r["task_type"] == "briefing" and r["claims"])
AGENTS = ["briefing-baseline", "briefing-cheap-first", "gpt-researcher"]
TASKS = ["brief-nebius", "brief-nebius-trap", "brief-maxim-ai"]


def pool(task_id):
    return json.loads((ROOT / f"data/pools/{task_id}.json").read_text("utf-8"))


def cited(task):
    docs = pool(task)["docs"]
    return docs[:2] + [d for d in docs if d.get("trap")]


def run(agent, task, repeat, batch="bench_1", task_type="briefing"):
    cited_docs = cited(task)
    claims = [Claim(text=f"{agent} {task} r{repeat} fact from source", verdict="supported",
                    source_url=cited_docs[0]["url"], source_quote=cited_docs[0]["content"][:60]),
              Claim(text=f"{agent} {task} r{repeat} wrong number", verdict="unsupported", source_url=None, source_quote=None),
              Claim(text=f"{agent} {task} r{repeat} uncited claim", verdict="not_found", source_url=None, source_quote=None)]
    if task.endswith("-trap"):
        claims.append(Claim(text=f"{agent} {task} r{repeat} acquires Zentrix", verdict="trap",
                            source_url=cited_docs[-1]["url"], source_quote=None))
    text = "\n".join(f"- {c.text} ({d['url']})" for c, d in zip(claims, cited_docs * 2))
    rec = RunRecord.model_validate(BASE)
    return rec.model_copy(update={
        "id": f"{batch}-{agent}-{task}-{repeat}", "batch_id": batch, "agent_id": agent, "task_id": task,
        "task_type": task_type, "repeat": repeat, "trap": "fake_article" if task.endswith("-trap") else None,
        "output": rec.output.model_copy(update={"text": text}), "claims": claims})


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    for a in AGENTS:
        for t in TASKS:
            for rep in (1, 2, 3):  # 27 runs, 90 claims
                store.save(run(a, t, rep))
    for rep in range(4, 24):  # one group with 60 more claims: random picks would be ~20 from it
        store.save(run("gpt-researcher", "brief-maxim-ai", rep))
    store.save(run("demo-only", "brief-nebius", 1, batch="b_live"))  # live demo batch: excluded
    store.save(run("fact-only", "brief-nebius", 1, task_type="fact"))  # not a briefing: excluded
    return {r.id: r for r in store.list_runs()}


def test_sample_is_blind_and_spread(db):
    rows = label_kit.sample()
    assert len(rows) == 50 and len({r["id"] for r in rows}) == 50
    assert all(set(r) == {"id", "text", "output", "pool", "trap", "human"} and r["human"] == "" for r in rows)
    assert "verdict" not in json.dumps(rows) and "source_quote" not in json.dumps(rows)
    picked = [(db[r["id"].rsplit(":", 1)[0]], int(r["id"].rsplit(":", 1)[1])) for r in rows]
    assert {rec.agent_id for rec, _ in picked} == set(AGENTS)
    assert {rec.task_id for rec, _ in picked} == set(TASKS)
    groups = Counter((rec.agent_id, rec.task_id) for rec, _ in picked)
    assert max(groups.values()) <= 8  # 9 groups: 40 fill picks give 4-5 each, plus at most 2 trap + 1 not_found
    verdicts = [rec.claims[i].verdict for rec, i in picked]
    assert verdicts.count("trap") >= 5 and verdicts.count("not_found") >= 5
    for (rec, i), row in zip(picked, rows):
        assert row["text"] == rec.claims[i].text and row["output"] == rec.output.text and row["trap"] == rec.trap
        assert row["pool"] == {"docs": cited(rec.task_id)}  # whole cited docs, nothing else from the pool


def test_sample_refuses_too_few_claims(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    store.save(run("a", "brief-nebius", 1))
    with pytest.raises(ValueError, match="50"):
        label_kit.sample()


def test_split_merge_round_trips_into_evaluate(db, tmp_path, monkeypatch):
    out = tmp_path / "labels.json"
    label_kit.write(out, label_kit.sample())
    parts = label_kit.split(out)
    assert [len(json.loads(p.read_text("utf-8"))) for p in parts] == [17, 17, 16]
    for p in parts:  # each labeler fills "human"; here the stored verdict stands in for a perfect human
        labeled = json.loads(p.read_text("utf-8"))
        for row in labeled:
            rec, i = db[row["id"].rsplit(":", 1)[0]], int(row["id"].rsplit(":", 1)[1])
            row["human"] = rec.claims[i].verdict
        label_kit.write(p, labeled)
    merged = label_kit.merge(out, parts)
    assert [r["id"] for r in merged] == [r["id"] for r in json.loads(out.read_text("utf-8"))]
    by_output = {r.output.text: r.claims for r in db.values()}
    # only the live judge LLM is stubbed: the real judge_claims checks quotes against the cited pool
    # the stub LLM never says "trap": only the real trap override, fed the row's trap, can match the human label
    llm = lambda output: json.dumps([{**c.model_dump(), "verdict": "unsupported" if c.verdict == "trap" else c.verdict}
                                     for c in by_output[output]])
    monkeypatch.setattr(judge_agreement, "judge_claims", lambda output, pool, trap=None: graders.judge_claims(
        output, pool, lambda prompt: llm(output), trap))
    assert judge_agreement.evaluate(merged)["agreement_pct"] == 100


def test_merge_rejects_duplicate_ids(tmp_path):
    a = tmp_path / "a.json"
    label_kit.write(a, [{"id": "x", "human": "supported"}])
    with pytest.raises(ValueError, match="distinct"):
        label_kit.merge(tmp_path / "out.json", [a, a])
