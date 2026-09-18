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


def test_awards_endpoint(client, _viz):
    award_stats.ensure_indexes()
    _rate(_viz)
    award_stats.capture_payouts(_archival_block(), 50)
    award_stats.dispatch(_op("award", {"initiator": "alice", "receiver": "bob", "memo": "post-1"}, op_id=1.0001))
    award_stats.dispatch(_op("award", {"initiator": "carol", "receiver": "bob", "memo": "post-1"}, op_id=2.0001))

    resp = client.get("/awards", params={"receiver": "bob", "memo": "post-1"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2
    assert set(body["initiators"]) == {"alice", "carol"}
    assert body["total_shares"] == 2.5
    assert body["total_viz"] == 5.0


def _archival_block(ts=dt.datetime(2026, 7, 5, tzinfo=dt.UTC)):
    """get_ops_in_block shape after save_block: real op first, then virtuals."""
    return [
        {"timestamp": ts, "op": ["award", {"initiator": "alice", "receiver": "bob", "memo": "post-1", "energy": 100}]},
        {"timestamp": ts, "op": ["receive_award", {"initiator": "alice", "receiver": "bob", "memo": "post-1", "shares": "2.500000 SHARES"}]},
        {"timestamp": ts, "op": ["receive_award", {"initiator": "carol", "receiver": "bob", "memo": "post-2", "shares": "9.000000 SHARES"}]},
    ]


def _rate(viz, fund="200.000 VIZ", shares="100.000000 SHARES"):
    viz.rpc.get_dynamic_global_properties.return_value = {
        "last_irreversible_block_num": 100,
        "total_vesting_fund": fund,
        "total_vesting_shares": shares,
    }
    award_stats._rate_cache = (0.0, 0.0)


def test_capture_payouts_sums_shares_and_converts_to_viz(_viz):
    award_stats.ensure_indexes()
    _rate(_viz)  # 2 VIZ per SHARE
    award_stats.capture_payouts(_archival_block(), 50)
    award_stats.capture_payouts(_archival_block(), 50)  # idempotent re-run
    award_stats.dispatch(_op("award", {"initiator": "alice", "receiver": "bob", "memo": "post-1"}, op_id=50.0001))

    t = award_stats.totals("bob", "post-1")
    assert t["count"] == 1  # payout rows never inflate the award count
    assert t["initiators"] == ["alice"]
    assert t["total_shares"] == 2.5
    assert t["total_viz"] == 5.0


def test_totals_viz_is_null_when_rate_unavailable(_viz):
    award_stats.ensure_indexes()
    _viz.rpc.get_dynamic_global_properties.side_effect = RuntimeError("node down")
    award_stats._rate_cache = (0.0, 0.0)
    award_stats.capture_payouts(_archival_block(), 50)

    t = award_stats.totals("bob", "post-1")
    assert t["total_shares"] == 2.5
    assert t["total_viz"] is None
