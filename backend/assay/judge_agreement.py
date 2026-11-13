"""Measure claim-judge agreement against the PRD-required 50 human labels."""

import argparse
import json
from collections import Counter
from pathlib import Path

from assay.graders import judge_claims


def agreement(rows: list[dict]) -> dict:
    if len(rows) != 50:
        raise ValueError(f"expected 50 labeled claims, got {len(rows)}")
    for row in rows:
        if row.get("human") not in {"supported", "unsupported", "trap", "not_found"}:
            raise ValueError("each row needs a valid human label")
        if row.get("judge") not in {"supported", "unsupported", "trap", "not_found"}:
            raise ValueError("each row needs a valid judge label")
    matches = sum(row["human"] == row["judge"] for row in rows)
    disagreements = Counter((row["human"], row["judge"]) for row in rows if row["human"] != row["judge"])
    return {"claims": 50, "matches": matches, "agreement_pct": matches * 2,
            "disagreements": {f"{a}->{b}": n for (a, b), n in sorted(disagreements.items())}}


def evaluate(rows: list[dict]) -> dict:
    """Run the actual judge over 50 independently human-labeled claim/source pairs."""
    if len(rows) != 50 or len({row.get("id") for row in rows}) != 50:
        raise ValueError("expected 50 distinct labeled claims")
    evaluated = []
    for row in rows:
        if row.get("human") not in {"supported", "unsupported", "trap", "not_found"}:
            raise ValueError("each claim needs a human verdict")
        claims = judge_claims(row["output"], row["pool"])
        if len(claims) != 1:
            raise ValueError(f"claim {row['id']} produced {len(claims)} judge verdicts")
        evaluated.append({"human": row["human"], "judge": claims[0].verdict})
    return agreement(evaluated)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("labels", type=Path, help="JSON array with human and judge labels")
    args = parser.parse_args()
    rows = json.loads(args.labels.read_text("utf-8"))
    print(json.dumps(evaluate(rows) if rows and "judge" not in rows[0] else agreement(rows), indent=2))


if __name__ == "__main__":
    main()
