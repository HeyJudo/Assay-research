"""The fixture SSE stream must parse with the batch event models (web and backend share it)."""

import json
from pathlib import Path

from assay.models import EVENT_DATA

STREAM = Path(__file__).resolve().parents[2] / "web" / "src" / "fixtures" / "stream.json"


def test_fixture_stream_matches_models():
    events = json.loads(STREAM.read_text("utf-8"))
    for e in events:
        EVENT_DATA[e["event"]].model_validate(e["data"], strict=True)
    names = [e["event"] for e in events]
    assert names[-1] == "batch_done" and names.count("batch_done") == 1
    started = {e["data"]["run_id"] for e in events if e["event"] == "run_started"}
    done = {e["data"]["run_id"] for e in events if e["event"] == "run_done"}
    assert started == done
