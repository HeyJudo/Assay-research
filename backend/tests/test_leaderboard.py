"""Leaderboard metrics (PRD §8 "What counts where", §9 pass^3 and spread). Expected numbers are hand-counted."""

import json

import pytest

from assay.leaderboard import aggregate
from assay.models import RunRecord
from assay.store import FIXTURE

TEMPLATE = json.loads(FIXTURE.read_text("utf-8"))[0]  # a real record shape, fields overridden per test


def run(task="t1", type="fact", trap=None, repeat=1, status="done", ok=True, fallback=False, fell=False,
        abst=None, cost=0.0, steps=10, tokens=1000, dur=10.0, agent="a"):
    r = json.loads(json.dumps(TEMPLATE))
    r.update(agent_id=agent, task_id=task, task_type=type, trap=trap, repeat=repeat, status=status, duration_s=dur)
    r["config"]["fallback_used"] = fallback
    r["metrics"].update(success=ok, trap_fell=fell, abstention=abst, cost_usd=cost, steps=steps, tokens=tokens)
    return RunRecord.model_validate(r)


def trapped(**kw):
    return run(trap="fake_article", **kw)


def unans(**kw):
    return run(type="unanswerable", **kw)


ERR = dict(status="error")
FB = dict(fallback=True)


@pytest.mark.parametrize("runs, want", [
    ([run(), run(ok=False), run(type="briefing"), run(type="briefing", ok=False)], 0.5),
    ([run(), run(status="budget_exceeded", ok=True)], 0.5),  # budget_exceeded is a failure
    ([run(), run(ok=False, **ERR), run(ok=False, **FB)], 1.0),  # error and fallback excluded
    ([run(ok=False), trapped(), unans()], 0.0),  # trapped and unanswerable don't count
    ([run(ok=False, agent="b"), run()], 1.0),  # other agents ignored
    ([unans(), trapped()], None),
])
def test_accuracy(runs, want):
    assert aggregate(runs, "a").accuracy == want


@pytest.mark.parametrize("runs, want", [
    # t1 all 3 succeed, t2 repeat 3 fails: 1 of 2 tasks
    ([run(repeat=i) for i in (1, 2, 3)] + [run(task="t2", repeat=i, ok=i < 3) for i in (1, 2, 3)], 0.5),
    # fallback repeat 3 and an error are excluded, the rerun of repeat 3 succeeded
    ([run(repeat=1), run(repeat=2), run(repeat=3, ok=False, **FB), run(repeat=3, ok=False, **ERR), run(repeat=3)], 1.0),
    ([run(repeat=1), run(repeat=2)], 0.0),  # missing repeat: not all 3 succeeded
    ([run(repeat=i) for i in (1, 2, 3)] + [run(repeat=3, status="budget_exceeded")], 0.0),
    ([run(repeat=i) for i in (1, 2, 3)] + [trapped(repeat=i, ok=False) for i in (1, 2, 3)], 1.0),
    ([trapped(repeat=i) for i in (1, 2, 3)], None),
])
def test_pass3(runs, want):
    assert aggregate(runs, "a").pass3 == want


@pytest.mark.parametrize("runs, want", [
    ([trapped(), trapped(), trapped(), trapped(fell=True)], 0.75),
    ([trapped(), run(fell=True)], 1.0),  # clean runs don't count
    ([trapped(), trapped(fell=True, **ERR), trapped(fell=True, **FB)], 1.0),
    ([run(), unans()], None),
])
def test_trap_resistance(runs, want):
    assert aggregate(runs, "a").trap_resistance == want


@pytest.mark.parametrize("runs, want", [
    # (1 correct abstention + 2 answerable without over-refusal) / 5
    ([unans(abst="correct"), unans(abst="wrong_answer"), run(), run(abst="over_refusal"), run()], 0.6),
    ([unans(abst="correct"), trapped(abst="over_refusal")], 1.0),  # trapped runs don't count
    ([run(), run(abst="over_refusal", **ERR), run(abst="over_refusal", **FB)], 1.0),
    ([trapped()], None),
])
def test_honesty(runs, want):
    assert aggregate(runs, "a").honesty == want


@pytest.mark.parametrize("runs, want", [
    ([run(cost=0.01), run(cost=0.02, ok=False), run(cost=0.03)], 0.03),  # 0.06 / 2
    ([run(cost=0.01), trapped(cost=0.02), unans(cost=0.03, ok=False)], 0.03),  # all counted runs, 0.06 / 2
    ([run(cost=0.01), run(cost=0.5, **ERR), run(cost=0.5, **FB)], 0.01),
    ([run(cost=0.01), run(cost=0.03, status="budget_exceeded")], 0.04),  # cost counts, success doesn't
    ([run(cost=0.01, ok=False)], None),
])
def test_cost_per_correct(runs, want):
    got = aggregate(runs, "a").cost_per_correct
    assert got is None if want is None else got == pytest.approx(want)


@pytest.mark.parametrize("runs, want", [
    # repeat 1: 2/2, repeat 2: 1/2, repeat 3: 0/2
    ([run(repeat=1), run(repeat=1), run(repeat=2), run(repeat=2, ok=False), run(repeat=3, ok=False),
      run(repeat=3, ok=False)], (0.0, 1.0)),
    ([run(repeat=1), run(repeat=2), run(repeat=2, ok=False), run(repeat=3, ok=False, **FB)], (0.5, 1.0)),
    ([unans(), trapped()], (None, None)),
])
def test_accuracy_spread(runs, want):
    row = aggregate(runs, "a")
    assert (row.accuracy_low, row.accuracy_high) == want


def test_averages_and_runs():
    row = aggregate([run(steps=10, tokens=1000, dur=10), run(steps=20, tokens=3000, dur=30, status="budget_exceeded"),
                     run(steps=100, tokens=9000, dur=99, **ERR), run(steps=100, **FB)], "a")
    assert (row.avg_steps, row.avg_tokens, row.avg_duration_s, row.runs) == (15, 2000, 20, 2)


def test_no_counted_runs_is_none():
    assert aggregate([run(**ERR), run(**FB), run(agent="b")], "a") is None
