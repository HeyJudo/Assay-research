"""Blind labeling kit for judge validation (PRD §3 item 8, §9): sample 50 judged claims, split for 3 labelers, merge.

Rows match judge_agreement.evaluate input. Never write the judge's verdict into a row: labelers must not see it.
Labels hold cited pool docs, trap docs included, so they live in data/labels/ (gitignored, PRD §9).
"""

import argparse
import json
import random
from itertools import chain, zip_longest
from pathlib import Path

from assay.api import bench_runs
from assay.graders import _cited_urls
from assay.runner import find_pool

LABELS = Path(__file__).resolve().parents[2] / "data" / "labels" / "labels.json"
N, RARE = 50, 5  # RARE: at least this many trap and not_found claims each, when the runs have them
LABELERS = 3


def _spread(cands: list, n: int) -> list:
    """Round-robin over (agent, task) so no single agent or task fills the sample."""
    groups: dict[tuple, list] = {}
    for c in cands:
        groups.setdefault((c[0].agent_id, c[0].task_id), []).append(c)
    return [c for c in chain(*zip_longest(*groups.values())) if c][:n]


def sample(seed: int = 0) -> list[dict]:
    runs = [r for r in bench_runs() if r.status == "done" and r.task_type == "briefing"]
    cands = [(r, i, c) for r in runs for i, c in enumerate(r.claims)]
    if len(cands) < N:
        raise ValueError(f"need {N} judged briefing claims in bench_ batches, found {len(cands)}")
    random.Random(seed).shuffle(cands)
    picked = _spread([c for c in cands if c[2].verdict == "trap"], RARE)
    picked += _spread([c for c in cands if c[2].verdict == "not_found"], RARE)
    taken = {(r.id, i) for r, i, _ in picked}
    picked += _spread([c for c in cands if (c[0].id, c[1]) not in taken], N - len(picked))
    pools = {r.task_id: json.loads(find_pool(r.task_id).read_text("utf-8")) for r in runs}
    rows = []
    for r, i, c in picked:
        cited = _cited_urls(r.output.text)
        rows.append({"id": f"{r.id}:{i}", "text": c.text, "output": r.output.text,
                     "pool": {"docs": [d for d in pools[r.task_id]["docs"] if d["url"] in cited]}, "human": ""})
    return rows


def write(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", "utf-8")


def _read(path: Path) -> list[dict]:
    return json.loads(path.read_text("utf-8"))


def split(path: Path) -> list[Path]:
    rows = _read(path)
    size = -(-len(rows) // LABELERS)
    parts = [path.with_suffix(f".{k + 1}.json") for k in range(LABELERS)]
    for k, part in enumerate(parts):
        write(part, rows[k * size:(k + 1) * size])
    return parts


def merge(out: Path, parts: list[Path]) -> list[dict]:
    rows = [row for p in parts for row in _read(p)]
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("merged parts must have distinct ids")
    write(out, rows)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    cmd = parser.add_subparsers(dest="cmd", required=True)
    s = cmd.add_parser("sample", help=f"write {N} blind claims from bench_ runs")
    s.add_argument("--out", type=Path, default=LABELS)
    s.add_argument("--seed", type=int, default=0)
    cmd.add_parser("split", help=f"split into {LABELERS} files").add_argument("labels", type=Path, nargs="?", default=LABELS)
    m = cmd.add_parser("merge", help="join labeled parts for judge_agreement")
    m.add_argument("parts", type=Path, nargs="+")
    m.add_argument("--out", type=Path, default=LABELS)
    args = parser.parse_args()
    if args.cmd == "sample":
        write(args.out, sample(args.seed))
        print(args.out)
    elif args.cmd == "split":
        print(*split(args.labels), sep="\n")
    else:
        merge(args.out, args.parts)
        print(args.out)


if __name__ == "__main__":
    main()
