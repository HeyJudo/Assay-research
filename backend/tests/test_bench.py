"""bench.py: real start_batch, real proxy, real probe subprocesses, real SQLite. Only Bifrost is a local stand-in."""

import json

import pytest
from test_batch import agent, env  # noqa: F401  (env is a fixture)

from assay import bench, runner, store

TASK = "fact-hinton-university"  # a probe agent, not ours: nothing is tuned on it (PRD §9)


@pytest.fixture
def cli(env, monkeypatch):  # noqa: F811
    srv, _ = env
    monkeypatch.setenv("BIFROST_URL", f"http://127.0.0.1:{srv.server_port}/v1")
    for i in range(1, 10):
        monkeypatch.setenv(f"BIFROST_RUN_VK_{i}", f"k{i}")
    return lambda *args: bench.main([*args])


def bench_runs():
    return [r for r in store.list_runs(task_id=TASK) if r.batch_id.startswith("bench_")]


def test_benchmark_tasks_only_never_practice():
    tasks = bench.task_ids()
    assert len(tasks) == 11 and TASK in tasks  # PRD §13: the Nov 15 suite (twins + unanswerable)
    assert not any(t.startswith("practice") for t in tasks)
    with pytest.raises(SystemExit):
        bench.main(["--tasks", "practice-python3-year", "--dry-run"])


def test_trap_comes_from_the_pool():
    assert bench.task_trap("fact-hinton-university-trap") == "fake_article"
    assert bench.task_trap("brief-maxim-ai-trap") == "hidden_instruction"
    assert bench.task_trap(TASK) is None


def test_agents_exclude_stub():
    assert "stub" not in bench.agent_ids()
    assert {"briefing-baseline", "gpt-researcher"} <= set(bench.agent_ids())


def test_plan_batches_at_most_three_agents(env, monkeypatch):  # noqa: F811
    for name in "cde":
        agent(runner.AGENTS_DIR, name)
    plan = bench.plan(["a", "b", "c", "d", "e"], [TASK, "fact-transformer-ceo"])
    assert [(t, sorted({a for a, _ in jobs})) for t, jobs in plan] == [
        (TASK, ["a", "b", "c"]), (TASK, ["d", "e"]),
        ("fact-transformer-ceo", ["a", "b", "c"]), ("fact-transformer-ceo", ["d", "e"])]
    assert plan[0][1] == [(a, r) for a in "abc" for r in (1, 2, 3)]


def test_dry_run_prints_plan_and_runs_nothing(cli, capsys, monkeypatch):
    monkeypatch.setattr(runner, "start_batch", lambda *a, **k: pytest.fail("dry run started a batch"))
    cli("--agents", "a,b", "--tasks", f"{TASK},fact-hinton-university-trap", "--dry-run")
    out = capsys.readouterr().out
    assert f"{TASK} trap=- a#1,a#2,a#3,b#1,b#2,b#3" in out
    assert "fact-hinton-university-trap trap=fake_article" in out
    assert "2 batches, 12 runs" in out
    assert store.list_runs() == []


def test_resume_skips_done_and_reruns_error_and_fallback(cli):
    cli("--agents", "a", "--tasks", TASK)
    first = bench_runs()
    assert sorted(r.repeat for r in first) == [1, 2, 3] and all(r.status == "done" for r in first)
    assert len({r.batch_id for r in first}) == 1

    cli("--agents", "a", "--tasks", TASK)  # nothing left to do
    assert len(bench_runs()) == 3

    by_repeat = {r.repeat: r for r in first}
    store.save(by_repeat[1].model_copy(update={"status": "error"}))
    store.save(by_repeat[2].model_copy(update={"config": by_repeat[2].config.model_copy(update={"fallback_used": True})}))
    live = by_repeat[3].model_copy(update={"id": "run_live", "batch_id": "b_live", "repeat": 1})
    store.save(live)  # a live-demo run never counts as benchmark progress

    assert bench.todo(["a"], TASK) == [("a", 1), ("a", 2)]
    cli("--agents", "a", "--tasks", TASK)
    new = [r for r in bench_runs() if r.id not in {x.id for x in first}]
    assert sorted(r.repeat for r in new) == [1, 2] and all(r.status == "done" for r in new)
    assert bench.todo(["a"], TASK) == []
    assert json.loads(new[0].output.text)["search"] == 200  # went through the batch proxy


def test_duplicate_flags_run_once(cli, capsys):
    cli("--agents", "a,a", "--tasks", f"{TASK},{TASK}", "--dry-run")
    assert "1 batches, 3 runs" in capsys.readouterr().out
    with pytest.raises(ValueError):
        runner.start_batch("bench_x", ["a"], runner.find_task(TASK), None, emit=print, bifrost_url="http://x/v1",
                           vks=["k1", "k2"], jobs=[("a", 1), ("a", 1)])


# Writes a heartbeat line every 0.1s until killed.
SLEEPER = """#!/usr/bin/env python3
import sys, time
while True:
    open(sys.argv[0] + ".beat", "a").write(".")
    time.sleep(0.1)
"""


def test_ctrl_c_kills_the_batch_processes(cli):
    import _thread
    import threading
    import time

    d = agent(runner.AGENTS_DIR, "sleepy", SLEEPER)
    beat = d / "run.beat"
    def ctrl_c_once_running():
        while not beat.exists():
            time.sleep(0.1)
        _thread.interrupt_main()

    threading.Thread(target=ctrl_c_once_running, daemon=True).start()
    with pytest.raises(KeyboardInterrupt):
        cli("--agents", "sleepy", "--tasks", TASK)
    time.sleep(1)
    size = beat.stat().st_size
    time.sleep(1)
    assert beat.stat().st_size == size  # and is dead now
    assert runner.LIVE == set()
