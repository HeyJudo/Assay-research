"""POST /api/batches, GET /api/batches/{id} and its SSE stream, end to end through the real runner and proxy."""

import json
import time

import pytest
import test_outage as to
from fastapi.testclient import TestClient
from test_batch import TASK_ID, agent

from assay import api, runner
from assay.models import EVENT_DATA

FAST = "#!/usr/bin/env python3\nimport os\nopen(os.environ['ASSAY_OUTPUT'], 'w').write('ok')\n"
SLOW = "#!/usr/bin/env python3\nimport os, time\ntime.sleep(3)\nopen(os.environ['ASSAY_OUTPUT'], 'w').write('ok')\n"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("RUN_PASSCODE", "open-sesame")
    for i in range(1, 10):
        monkeypatch.setenv(f"BIFROST_RUN_VK_{i}", f"sk-bf-slot{i}")
    srv, _ = to.sentinel()
    monkeypatch.setenv("BIFROST_URL", f"http://127.0.0.1:{srv.server_port}/v1")
    monkeypatch.setattr(runner, "AGENTS_DIR", tmp_path / "agents")
    monkeypatch.setattr(api, "BATCHES", {})
    (tmp_path / "agents").mkdir()
    agent(tmp_path / "agents", "fast", FAST)
    agent(tmp_path / "agents", "fast2", FAST)
    agent(tmp_path / "agents", "slow", SLOW)
    with TestClient(api.app) as c:
        yield c
    srv.shutdown()


def body(**kw):
    return {"agents": ["fast"], "task_id": TASK_ID, "trap": None, "passcode": "open-sesame", **kw}


def read_stream(c, bid, **headers):
    """Parse the SSE stream into (id, event, data) until the server closes it."""
    out, msg = [], {}
    with c.stream("GET", f"/api/batches/{bid}/stream", headers=headers) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        for line in r.iter_lines():
            if not line:
                out.append((int(msg["id"]), msg["event"], json.loads(msg["data"])))
                msg = {}
            else:
                k, _, v = line.partition(": ")
                msg[k] = v
    return out


def wait_done(c, bid):
    for _ in range(300):
        if c.get(f"/api/batches/{bid}").json()["status"] == "done":
            return
        time.sleep(0.1)
    pytest.fail("batch did not finish")


def test_batch_streams_to_done(client):
    r = client.post("/api/batches", json=body(agents=["fast", "fast2"]))
    assert r.status_code == 200
    bid = r.json()["batch_id"]
    events = read_stream(client, bid)

    assert [i for i, _, _ in events] == list(range(len(events)))
    for _, name, data in events:
        EVENT_DATA[name].model_validate(data, strict=True)
    names = [n for _, n, _ in events]
    assert names.count("run_started") == 6 and names.count("run_done") == 6 and names[-1] == "batch_done"

    status = client.get(f"/api/batches/{bid}").json()
    assert status["status"] == "done" and status["repeats"] == 3
    assert (status["agents"], status["task_id"], status["trap"]) == (["fast", "fast2"], TASK_ID, None)
    runs = client.get("/api/runs", params={"batch_id": bid}).json()
    assert len(runs) == 6 and {r["status"] for r in runs} == {"done"}


def test_stream_resumes_after_last_event_id(client):
    bid = client.post("/api/batches", json=body()).json()["batch_id"]
    full = read_stream(client, bid)
    assert read_stream(client, bid, **{"Last-Event-ID": "2"}) == full[3:]


def test_wrong_or_unset_passcode_is_403(client, monkeypatch):
    assert client.post("/api/batches", json=body(passcode="nope")).status_code == 403
    monkeypatch.setenv("RUN_PASSCODE", "")
    assert client.post("/api/batches", json=body(passcode="")).status_code == 403
    assert api.BATCHES == {}


def test_one_batch_at_a_time(client):
    first = client.post("/api/batches", json=body(agents=["slow"]))
    assert first.status_code == 200
    assert client.post("/api/batches", json=body()).status_code == 409
    wait_done(client, first.json()["batch_id"])
    assert client.post("/api/batches", json=body()).status_code == 200


@pytest.mark.parametrize("kw,code", [
    (dict(task_id="nope"), 404),
    (dict(agents=["nope"]), 422),
    (dict(agents=["fast", "fast"]), 422),
    (dict(agents=["fast", "fast2", "slow", "fast"]), 422),
    (dict(agents=[]), 422),
    (dict(trap="stale_page"), 422),
])
def test_bad_request(client, kw, code):
    assert client.post("/api/batches", json=body(**kw)).status_code == code
    assert api.BATCHES == {}  # a refused batch does not block the next one


def test_missing_run_key_refused(client, monkeypatch):
    monkeypatch.delenv("BIFROST_RUN_VK_3")
    r = client.post("/api/batches", json=body())
    assert r.status_code == 422 and "BIFROST_RUN_VK" in r.json()["detail"]
    assert api.BATCHES == {}


def test_unknown_batch_404(client):
    assert client.get("/api/batches/b_nope").status_code == 404
    assert client.get("/api/batches/b_nope/stream").status_code == 404
