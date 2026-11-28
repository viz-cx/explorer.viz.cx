"""voice_ops capture/page + /voice endpoint + backfill run."""
import datetime as dt
import json

from helpers import voice_ops
from helpers.mongo import coll

TS = dt.datetime(2026, 11, 1, tzinfo=dt.UTC)


def _custom(pid, payload, acc="alice", raw=None):
    return {"timestamp": TS, "op": ["custom", {
        "required_active_auths": [], "required_regular_auths": [acc],
        "id": pid, "json": raw if raw is not None else json.dumps(payload),
    }]}


def _block():
    return [
        _custom("V", {"p": 0, "d": {"t": "hello"}}),
        _custom("follow", {"x": 1}),
        {"timestamp": TS, "op": ["transfer", {"from": "a"}]},
        _custom("V", None, raw="{not json"),
        _custom("VE", {"e": "h", "b": 10}, acc="bob"),
        _custom("V", None, raw='{"d": {"t": "line1\nline2"}}'),  # raw newline in a string
    ]


def test_capture_stores_v_and_ve_only_and_survives_bad_json():
    voice_ops.ensure_indexes()
    assert voice_ops.capture(_block(), 10) == 3
    voice_ops.capture(_block(), 10)  # idempotent
    items = voice_ops.page(0, 10)
    assert [(i["seq"], i["protocol"], i["account"]) for i in items] == [
        (10 * 100_000, "V", "alice"), (10 * 100_000 + 4, "VE", "bob"), (10 * 100_000 + 5, "V", "alice"),
    ]
    assert items[2]["json"]["d"]["t"] == "line1\nline2"
    assert items[0]["json"] == {"p": 0, "d": {"t": "hello"}}
    assert items[0]["block"] == 10


def test_page_orders_and_pages_by_seq():
    voice_ops.ensure_indexes()
    voice_ops.capture(_block(), 20)
    voice_ops.capture(_block(), 10)
    first = voice_ops.page(0, 2)
    assert [i["block"] for i in first] == [10, 10]
    rest = voice_ops.page(first[-1]["seq"], 10)
    assert [i["block"] for i in rest] == [10, 20, 20, 20]


def test_voice_endpoint(client):
    voice_ops.capture(_block(), 10)
    r = client.get("/voice", params={"after": 0, "limit": 1})
    assert r.status_code == 200
    assert [i["protocol"] for i in r.json()["items"]] == ["V"]
    assert client.get("/voice", params={"limit": 5000}).status_code == 422


def test_backfill_run_scans_blocks(monkeypatch):
    from scripts import backfill_voice_ops as bf

    monkeypatch.setattr(bf, "STEP", 3)
    for n in range(1, 8):
        coll.insert_one({"_id": n, "block": _block() if n in (2, 6) else [_custom("x", {})]})
    # mongomock has no hint(); the real index check is VOICE_EXPLAIN on prod.
    monkeypatch.setattr(type(coll.find({})), "hint", lambda self, _i: self, raising=False)
    assert bf.run(1, 7) == 6
    assert {i["block"] for i in voice_ops.page(0, 10)} == {2, 6}
