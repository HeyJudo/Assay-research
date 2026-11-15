"""Full benchmark CLI (PRD §8): agents × data/tasks in batches of ≤3 agents × 1 task × 3 repeats through
runner.start_batch, one batch at a time. Benchmark data only, never data/practice (PRD §9).

Resumable: an (agent, task, repeat) with a counted bench_ run in SQLite is skipped. Error runs, runs left
`running` by a killed CLI, and fallback runs (PRD §7) are run again. The old record stays in SQLite and the
leaderboard ignores it.

    uv run python -m assay.bench [--agents a,b] [--tasks t1,t2] [--dry-run]
"""

import argparse
import json
import os
import uuid

from assay import runner, store

MAX_AGENTS = 3  # PRD §13 batch limit


def agent_ids() -> list[str]:
    return [d.name for d in sorted(runner.AGENTS_DIR.iterdir())
            if d.name != "stub" and runner.find_agent(d.name) is not None]


def task_ids() -> list[str]:
    """The 11-task suite (PRD §13, Nov 15): trapped twins, their clean twins, and the unanswerable tasks.
    Tasks without a twin stay in data/tasks but are not run, to fit free-tier quotas."""
    tasks = [json.loads(f.read_text("utf-8")) for f in sorted((runner.DATA / "tasks").glob("*.json"))]
    twins = {t["trap_twin"] for t in tasks if t.get("trap_twin")}
    return [t["id"] for t in tasks if t["type"] == "unanswerable" or t.get("trap_twin") or t["id"] in twins]


def task_trap(task_id: str):
    """A trapped twin's trap is the one its pool plants. Other tasks run clean."""
    docs = json.loads(runner.find_pool(task_id).read_text("utf-8"))["docs"]
    return next((d["trap"] for d in docs if d.get("trap")), None)


def counted(r) -> bool:  # same rule as leaderboard.aggregate
    return r.status in ("done", "budget_exceeded") and not r.config.fallback_used


def todo(agents: list[str], task_id: str) -> list[tuple[str, int]]:
    done = {(r.agent_id, r.repeat) for r in store.list_runs(task_id=task_id)
            if r.batch_id.startswith("bench_") and counted(r)}
    return [(a, n) for a in agents for n in range(1, runner.REPEATS + 1) if (a, n) not in done]


def plan(agents: list[str], tasks: list[str]) -> list[tuple[str, list[tuple[str, int]]]]:
    """[(task id, jobs)], each batch ≤3 agents of one task."""
    out = []
    for t in tasks:
        jobs = todo(agents, t)
        left = list(dict.fromkeys(a for a, _ in jobs))
        for i in range(0, len(left), MAX_AGENTS):
            group = left[i:i + MAX_AGENTS]
            out.append((t, [j for j in jobs if j[0] in group]))
    return out


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="assay.bench")
    ap.add_argument("--agents", help="comma-separated agent ids (default: all but stub)")
    ap.add_argument("--tasks", help="comma-separated ids from data/tasks (default: all)")
    ap.add_argument("--dry-run", action="store_true", help="print the batch plan and exit")
    a = ap.parse_args(argv)
    agents, tasks = agent_ids(), task_ids()
    pick_a = list(dict.fromkeys(a.agents.split(","))) if a.agents else agents
    pick_t = list(dict.fromkeys(a.tasks.split(","))) if a.tasks else tasks
    if bad := [x for x in pick_a if x not in agents] + [x for x in pick_t if x not in tasks]:
        ap.error(f"not a benchmark agent or task: {', '.join(bad)}")

    batches = plan(pick_a, pick_t)
    for t, jobs in batches:
        print(f"{t} trap={task_trap(t) or '-'} {','.join(f'{x}#{n}' for x, n in jobs)}")
    print(f"{len(batches)} batches, {sum(len(j) for _, j in batches)} runs")
    if a.dry_run:
        return

    bifrost = os.environ.get("BIFROST_URL") or "http://localhost:8080/v1"
    vks = [os.environ.get(f"BIFROST_RUN_VK_{i}", "") for i in range(1, 10)]
    for i, (t, jobs) in enumerate(batches, 1):
        bid = f"bench_{uuid.uuid4().hex[:12]}"
        print(f"[{i}/{len(batches)}] {bid} {t}", flush=True)

        def emit(name, data):
            if name == "run_done":
                print(f"  {data.run_id} {data.status}", flush=True)

        # Sequential: start_batch's per-slot Bifrost usage lookup assumes one batch at a time.
        th = runner.start_batch(bid, list(dict.fromkeys(x for x, _ in jobs)), runner.find_task(t), task_trap(t),
                                emit=emit, bifrost_url=bifrost, vks=vks, jobs=jobs)
        try:
            while th.is_alive():
                th.join(0.5)  # a bare join ignores Ctrl-C on Windows
        except KeyboardInterrupt:
            runner.kill_all()  # its runs stay `running` in SQLite and the next resume runs them again
            raise


if __name__ == "__main__":
    main()
