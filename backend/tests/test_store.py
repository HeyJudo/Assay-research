import json

import pytest

from assay import store
from assay.models import RunRecord


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSAY_DB", str(tmp_path / "t.db"))


def fixtures():
    return [RunRecord.model_validate(r) for r in json.loads(store.FIXTURE.read_text(encoding="utf-8"))]


def test_round_trip():
    rec = fixtures()[0]
    store.save(rec)
    assert store.get(rec.id) == rec
    assert store.get("nope") is None


def test_list_filters():
    recs = fixtures()
    for r in reversed(recs):
        store.save(r)
    r0 = recs[0]
    assert {r.id for r in store.list_runs()} == {r.id for r in recs}
    assert all(r.batch_id == r0.batch_id for r in store.list_runs(batch_id=r0.batch_id))
    assert all(r.agent_id == r0.agent_id for r in store.list_runs(agent_id=r0.agent_id))
    assert all(r.task_id == r0.task_id for r in store.list_runs(task_id=r0.task_id))
    assert len(store.list_runs(agent_id=r0.agent_id)) == sum(r.agent_id == r0.agent_id for r in recs)
    assert len(store.list_runs(task_id=r0.task_id)) == sum(r.task_id == r0.task_id for r in recs)
    assert len(store.list_runs(batch_id=r0.batch_id)) == sum(r.batch_id == r0.batch_id for r in recs)
    assert store.list_runs(agent_id="nobody") == []
    started = [r.started_at for r in store.list_runs()]
    assert started == sorted(started)


def test_seed_if_empty():
    store.seed_if_empty()
    assert len(store.list_runs()) == 4
    first = fixtures()[0]
    store.save(first.model_copy(update={"repeat": 99}))
    store.seed_if_empty()
    assert store.get(first.id).repeat == 99
