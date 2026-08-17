"""Tests for award_stats dispatch + totals, and the /awards endpoint."""
import datetime as dt
import os

from helpers import award_stats
from helpers.db_client import get_db


def _op(op_type, body, op_id=1.0001):
    return {"_id": op_id, "timestamp": dt.datetime(2026, 7, 5, tzinfo=dt.UTC), "op": [op_type, body]}


def _rows():
    coll = get_db()[os.getenv("COLLECTION_AWARDS", "award_ops")]
    return list(coll.find({}))


def test_dispatch_ignores_non_award_ops():
    award_stats.ensure_indexes()
    award_stats.dispatch(_op("transfer", {"from": "a", "to": "b"}))
    assert _rows() == []


def test_totals_counts_distinct_initiators_for_same_receiver_and_memo():
    award_stats.ensure_indexes()
    award_stats.dispatch(_op("award", {"initiator": "alice", "receiver": "bob", "memo": "post-1"}, op_id=1.0001))
    award_stats.dispatch(_op("award", {"initiator": "carol", "receiver": "bob", "memo": "post-1"}, op_id=2.0001))

    t = award_stats.totals("bob", "post-1")
    assert t["count"] == 2
    assert set(t["initiators"]) == {"alice", "carol"}


def test_totals_excludes_different_memo():
    award_stats.ensure_indexes()
    award_stats.dispatch(_op("award", {"initiator": "alice", "receiver": "bob", "memo": "post-1"}, op_id=1.0001))
    award_stats.dispatch(_op("award", {"initiator": "dave", "receiver": "bob", "memo": "post-2"}, op_id=3.0001))

    t = award_stats.totals("bob", "post-1")
    assert t["count"] == 1
    assert t["initiators"] == ["alice"]


def test_dispatch_dedupes_same_op_id():
    award_stats.ensure_indexes()
    op = _op("award", {"initiator": "alice", "receiver": "bob", "memo": "post-1"}, op_id=9.0001)
    award_stats.dispatch(op)
    award_stats.dispatch(op)

    t = award_stats.totals("bob", "post-1")
    assert t["count"] == 1


def test_awards_endpoint(client):
    award_stats.ensure_indexes()
    award_stats.dispatch(_op("award", {"initiator": "alice", "receiver": "bob", "memo": "post-1"}, op_id=1.0001))
    award_stats.dispatch(_op("award", {"initiator": "carol", "receiver": "bob", "memo": "post-1"}, op_id=2.0001))

    resp = client.get("/awards", params={"receiver": "bob", "memo": "post-1"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert set(body["initiators"]) == {"alice", "carol"}
    assert body["total_viz"] is None
