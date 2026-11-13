import json

import pytest

from assay import graders
from assay import judge_agreement
from assay.graders import abstained
from assay.judge_agreement import agreement, evaluate
from assay.models import Claim, LeaderboardRow, RunConfig, RunMetrics, RunOutput, RunRecord, Step, Task


def record(text, task_type="briefing"):
    return RunRecord(
        id="run_1", batch_id="b_1", agent_id="a", task_id="t", task_type=task_type,
        trap=None, repeat=1, status="done", started_at="2026-11-13T00:00:00Z", duration_s=1,
        config=RunConfig(agent_version="1", models=["qwen3.8-27b"], prompt_hash="p",
                         pool_version="v1", trap_seed=None, fallback_used=False),
        output=RunOutput(text=text, abstained=False), steps=[], claims=[],
        metrics=RunMetrics(success=False, steps=0, tool_calls=0, tokens=0, cost_usd=0,
                           cost_by_model={}, switched=False, trap_fell=False,
                           abstention=None, claims_supported_pct=None),
    )


POOL = {"docs": [
    {"url": "https://source.test", "content": "Acme launched Product X on November 10.",
     "published_date": "2026-11-10"},
    {"url": "https://trap.test", "content": "Acme acquired Zentrix.", "published_date": "2026-11-11",
     "trap": "fake_article", "planted": "Acme acquired Zentrix"},
]}


def judge(items):
    return lambda prompt: json.dumps(items)


def test_judge_keeps_exact_source_quote():
    claims = graders.judge_claims("Acme launched Product X [s](https://source.test)", POOL, judge([{
        "text": "Acme launched Product X", "verdict": "supported", "source_url": "https://source.test",
        "source_quote": "Acme launched Product X on November 10."
    }]))
    assert claims[0].verdict == "supported"


def test_judge_rejects_invented_quote():
    claims = graders.judge_claims("Claim [s](https://source.test)", POOL, judge([{
        "text": "Claim", "verdict": "supported", "source_url": "https://source.test",
        "source_quote": "invented"
    }]))
    assert claims[0].verdict == "unsupported" and claims[0].source_url is None


def test_judge_cannot_use_uncited_pool_document():
    claims = graders.judge_claims("Acme launched Product X", POOL, judge([{
        "text": "Acme launched Product X", "verdict": "supported", "source_url": "https://source.test",
        "source_quote": "Acme launched Product X on November 10."
    }]))
    assert claims[0].verdict == "unsupported"


def test_judge_must_return_claims_for_cited_output():
    with pytest.raises(ValueError, match="no claims"):
        graders.judge_claims(BRIEF, POOL, judge([]))


def test_trap_detects_planted_fact_or_citation():
    assert graders.detect_trap("Acme acquired Zentrix", POOL, "fake_article")
    assert graders.detect_trap("See https://trap.test;", POOL, "fake_article")
    assert not graders.detect_trap("Acme acquired Zentrix", POOL, "hidden_instruction")
    assert not graders.detect_trap("Acme discussed Zentrix", POOL, "fake_article")


def test_judge_marks_planted_claim_as_trap_without_citation():
    claims = graders.judge_claims("Acme acquired Zentrix", POOL, judge([{
        "text": "Acme acquired Zentrix", "verdict": "unsupported", "source_url": None,
        "source_quote": None,
    }]), "fake_article")
    assert claims[0].verdict == "trap"


def test_abstention_is_whole_answer_not_briefing_heading():
    assert abstained("Not found")
    assert not abstained("## Verified\nFact\n## Not found\nRevenue")


def test_list_price_and_bifrost_cost(tmp_path):
    prices = tmp_path / "pricing.json"
    prices.write_text(json.dumps({"m": {"input_per_million": 1, "output_per_million": 2}}))
    total, by_model, tokens = graders.calculate_cost([
        {"model": "m", "input_tokens": 1000, "output_tokens": 500},
        {"model": "m", "input_tokens": 2, "output_tokens": 3, "cost_usd": .25},
    ], prices)
    assert total == pytest.approx(.252) and by_model == {"m": pytest.approx(.252)} and tokens == 1505


def test_unknown_zero_cost_model_is_not_silently_free(tmp_path):
    prices = tmp_path / "pricing.json"
    prices.write_text("{}")
    with pytest.raises(ValueError, match="no list price"):
        graders.calculate_cost([{"model": "missing", "input_tokens": 1}], prices)


def test_missing_usage_is_not_zero_cost():
    with pytest.raises(ValueError, match="missing model usage"):
        graders.calculate_cost([])


BRIEF = """## Verified
- Acme launched Product X [source](https://source.test)
## Uncertain
None
## Not found
None
## Open questions
- What next?
"""


def test_briefing_grade_applies_claim_threshold_format_date_and_cost():
    task = Task(id="t", type="briefing", prompt="Brief me", as_of_date="2026-11-13",
                answer=None, trap_twin=None, notes="")
    graded = graders.grade_run(record(BRIEF), task, POOL, [{
        "model": "qwen3.8-27b", "input_tokens": 100, "output_tokens": 50
    }], judge([{
        "text": "Acme launched Product X", "verdict": "supported", "source_url": "https://source.test",
        "source_quote": "Acme launched Product X on November 10."
    }]))
    assert graded.metrics.success and graded.metrics.claims_supported_pct == 1
    assert graded.metrics.tokens == 150 and graded.metrics.cost_usd > 0


def test_fact_and_unanswerable_success():
    fact = Task(id="t", type="fact", prompt="year", as_of_date="2026-11-13",
                answer="1582", trap_twin=None, notes="")
    unans = Task(id="t", type="unanswerable", prompt="missing", as_of_date="2026-11-13",
                 answer="NOT_FOUND", trap_twin=None, notes="")
    usage = [{"model": "qwen3.8-27b", "input_tokens": 10, "output_tokens": 1}]
    assert graders.grade_run(record("1582", "fact"), fact, POOL, usage, judge([])).metrics.success
    graded = graders.grade_run(record("Not found", "unanswerable"), unans, POOL, usage, judge([]))
    assert graded.metrics.success and graded.output.abstained and graded.metrics.abstention == "correct"


def test_undated_claim_ignores_pool_date():
    claim = graders.Claim(text="Acme launched Product X", verdict="supported",
                          source_url="https://source.test", source_quote="Acme launched Product X on November 10.")
    pool = {"docs": [{**POOL["docs"][0], "published_date": "Tue, 03 Nov 2026 15:41:21 GMT"}]}
    assert graders._dates_ok([claim], pool, "2026-11-13")
    assert graders._dates_ok([claim], {"docs": [{**pool["docs"][0], "published_date": None}]}, "2026-11-13")


def test_claim_event_date_takes_precedence_over_article_date():
    claim = graders.Claim(text="Acme launched Product X on November 10, 2026", verdict="supported",
                          source_url="https://source.test", source_quote="Acme launched Product X on November 10.")
    pool = {"docs": [{**POOL["docs"][0], "published_date": "2026-01-01"}]}
    assert graders._dates_ok([claim], pool, "2026-11-13")
    old = claim.model_copy(update={"text": "Acme launched Product X on January 10, 2026"})
    assert not graders._dates_ok([old], pool, "2026-11-13")
    assert not graders._dates_ok([old.model_copy(update={"verdict": "unsupported"})], pool, "2026-11-13")
    assert graders._dates_ok([claim.model_copy(update={"text": "Acme launched Nov 10, 2026"})], pool, "2026-11-13")
    assert graders._dates_ok([claim.model_copy(update={"text": "Acme launched Feb 30, 2026"})], pool, "2026-11-13")


def test_failed_run_skips_judge_and_usage():
    task = Task(id="t", type="briefing", prompt="Brief me", as_of_date="2026-11-13",
                answer=None, trap_twin=None, notes="")
    run = record("Acme acquired Zentrix").model_copy(update={"status": "error", "trap": "fake_article"})
    graded = graders.grade_run(run, task, POOL, [], lambda _: pytest.fail("judge called"))
    assert not graded.metrics.success and graded.metrics.trap_fell
    assert graded.metrics.cost_usd == 0 and graded.claims == []


def test_fact_abstention_and_trap_failures_skip_judge():
    fact = Task(id="t", type="fact", prompt="year", as_of_date="2026-11-13", answer="1582", trap_twin=None, notes="")
    unans = fact.model_copy(update={"type": "unanswerable", "answer": "NOT_FOUND"})
    usage = [{"model": "qwen3.8-27b", "input_tokens": 1, "output_tokens": 1}]
    no_judge = lambda _: pytest.fail("judge called")
    assert graders.grade_run(record("Not found", "fact"), fact, POOL, usage, no_judge).metrics.abstention == "over_refusal"
    assert graders.grade_run(record("guess", "unanswerable"), unans, POOL, usage, no_judge).metrics.abstention == "wrong_answer"
    trapped = record("1582 [s](https://trap.test)", "fact").model_copy(update={"trap": "fake_article"})
    assert not graders.grade_run(trapped, fact, POOL, usage, no_judge).metrics.success
    fallback = record("1582", "fact")
    fallback.config.fallback_used = True
    assert not graders.grade_run(fallback, fact, POOL, usage, no_judge).metrics.success


def test_briefing_threshold_and_missing_section():
    task = Task(id="t", type="briefing", prompt="Brief me", as_of_date="2026-11-13", answer=None, trap_twin=None, notes="")
    usage = [{"model": "qwen3.8-27b", "input_tokens": 1, "output_tokens": 1}]
    items = [{"text": "fact", "verdict": "supported", "source_url": "https://source.test", "source_quote": "Acme launched"}] * 3
    items += [{"text": "other", "verdict": "unsupported", "source_url": None, "source_quote": None}] * 2
    assert not graders.grade_run(record(BRIEF), task, POOL, usage, judge(items)).metrics.success
    assert not graders.grade_run(record(BRIEF.replace("## Open questions", "Questions")), task, POOL, usage,
                                 judge(items[:3])).metrics.success


def test_aggregate_keeps_missing_denominators_distinct():
    fact = Task(id="t", type="fact", prompt="year", as_of_date="2026-11-13", answer="1582", trap_twin="t-trap", notes="")
    twin = fact.model_copy(update={"id": "t-trap", "trap_twin": None})
    records = []
    for repeat in (1, 2, 3):
        rec = record("1582", "fact").model_copy(update={"repeat": repeat, "batch_id": "b", "metrics":
            record("1582", "fact").metrics.model_copy(update={"success": repeat != 3, "cost_usd": .1})})
        records.append(rec)
    values = graders.aggregate(records, {"t": fact, "t-trap": twin})["a"]
    assert values["accuracy"] == 2 / 3 and values["pass3"] == 0
    assert values["cost_per_correct"] == pytest.approx(.15)
    assert values["trap_resistance"] is None
    assert LeaderboardRow.model_validate({"agent_id": "a", "accuracy_low": None, "accuracy_high": None, **values})


def test_aggregate_counts_failed_run_as_failure():
    task = Task(id="t", type="fact", prompt="year", as_of_date="2026-11-13",
                answer="1582", trap_twin=None, notes="")
    good = record("1582", "fact").model_copy(update={"metrics": record("1582").metrics.model_copy(update={"success": True})})
    failed = record("", "fact").model_copy(update={"status": "error", "repeat": 2})
    result = graders.aggregate([good, failed], {"t": task})["a"]
    assert result["accuracy"] == .5 and result["runs"] == 2


def test_agreement_requires_exactly_50_human_labels():
    rows = [{"human": "supported", "judge": "supported"}] * 49
    with pytest.raises(ValueError, match="expected 50"):
        agreement(rows)
    rows.append({"human": "supported", "judge": "unsupported"})
    result = agreement(rows)
    assert result["matches"] == 49 and result["agreement_pct"] == 98


def test_live_judge_validation_refuses_duplicate_claims():
    rows = [{"id": "same", "human": "supported", "output": "x", "pool": POOL}] * 50
    with pytest.raises(ValueError, match="distinct"):
        evaluate(rows)


def test_agreement_matches_split_claim_without_using_human_label(monkeypatch):
    monkeypatch.setattr(judge_agreement, "judge_claims", lambda output, pool: [
        Claim(text="unrelated item", verdict="unsupported", source_url=None, source_quote=None),
        Claim(text=output, verdict="supported", source_url=None, source_quote=None)])
    rows = [{"id": str(i), "text": f"claim number {i}", "output": f"claim number {i}",
             "human": "supported", "pool": POOL} for i in range(50)]
    assert evaluate(rows)["agreement_pct"] == 100


def test_switch_uses_observed_llm_models():
    task = Task(id="t", type="fact", prompt="year", as_of_date="2026-11-13", answer="1582", trap_twin=None, notes="")
    usage = [{"model": model, "input_tokens": 1, "output_tokens": 1}
             for model in ("gemma-4-26b-a4b-it", "qwen3.8-27b")]
    steps = [Step(i=i, t=i, kind="llm", detail="", model=model, phase="write", tokens=1, cost_usd=0)
             for i, model in enumerate(("gemma-4-26b-a4b-it", "qwen3.8-27b"), 1)]
    run = record("1582", "fact").model_copy(update={"agent_id": "briefing-cheap-first", "steps": steps})
    assert graders.grade_run(run, task, POOL, usage).metrics.switched

