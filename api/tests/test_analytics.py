import datetime as dt

from helpers.analytics import aggregate_history, parse_asset


def _entry(seq, ts, op_type, body):
    return [seq, {"timestamp": ts, "op": [op_type, body]}]


def test_parse_asset():
    assert parse_asset("1.234000 SHARES") == (1.234, "SHARES")
    assert parse_asset("10 VIZ") == (10.0, "VIZ")
    assert parse_asset("garbage") == (0.0, "")
    assert parse_asset(None) == (0.0, "")


def test_aggregate_rewards_received_and_given():
    now = dt.datetime(2026, 7, 3, 12, 0, 0)
    entries = [
        _entry(1, "2026-07-01T00:00:00", "receive_award", {"receiver": "alice", "reward": "2.000000 SHARES"}),
        _entry(2, "2026-07-01T06:00:00", "receive_award", {"receiver": "alice", "reward": "0.500000 SHARES"}),
        _entry(3, "2026-07-02T00:00:00", "fixed_award", {"initiator": "alice", "receiver": "bob", "reward_amount": "1.000000 SHARES"}),
        _entry(4, "2026-07-02T00:00:00", "award", {"initiator": "alice", "receiver": "bob", "energy": 500}),
        _entry(5, "2026-07-02T01:00:00", "transfer", {"from": "alice", "to": "bob", "amount": "3.000 VIZ"}),
    ]
    out = aggregate_history(entries, "alice", now)

    assert out["rewards"]["received"] == [{"symbol": "SHARES", "total": 2.5, "count": 2}]
    assert out["rewards"]["given"] == [{"symbol": "SHARES", "total": 1.0, "count": 1}]
    # award category = 2 receive_award + 1 fixed_award + 1 award = 4
    assert out["activity"]["by_category"]["award"] == 4
    assert out["activity"]["by_category"]["transfer"] == 1
    assert out["range"]["ops_scanned"] == 5
    assert out["range"]["window"] == "90d"
    assert out["range"]["truncated"] is False
    assert out["range"]["from"] == "2026-07-01T00:00:00"
    assert out["range"]["to"] == "2026-07-02T01:00:00"


def test_activity_award_category_counts_all_award_ops():
    now = dt.datetime(2026, 7, 3, 12, 0, 0)
    entries = [
        _entry(1, "2026-07-01T00:00:00", "receive_award", {"receiver": "alice", "reward": "1.000000 SHARES"}),
        _entry(2, "2026-07-01T00:00:00", "award", {"initiator": "alice", "receiver": "bob", "energy": 100}),
        _entry(3, "2026-07-01T00:00:00", "fixed_award", {"initiator": "alice", "receiver": "bob", "reward_amount": "1.000000 SHARES"}),
    ]
    out = aggregate_history(entries, "alice", now)
    # receive_award + award + fixed_award all map to category "award"
    assert out["activity"]["by_category"]["award"] == 3


def test_timeline_buckets_daily():
    now = dt.datetime(2026, 7, 3, 12, 0, 0)
    entries = [
        _entry(1, "2026-07-01T05:00:00", "receive_award", {"receiver": "alice", "reward": "1.000000 SHARES"}),
        _entry(2, "2026-07-01T20:00:00", "receive_award", {"receiver": "alice", "reward": "2.000000 SHARES"}),
        _entry(3, "2026-07-02T09:00:00", "receive_award", {"receiver": "alice", "reward": "4.000000 SHARES"}),
    ]
    out = aggregate_history(entries, "alice", now)
    assert out["rewards"]["timeline"] == [
        {"date": "2026-07-01", "received": 3.0, "given": 0.0},
        {"date": "2026-07-02", "received": 4.0, "given": 0.0},
    ]
    assert out["activity"]["timeline"] == [
        {"date": "2026-07-01", "count": 2},
        {"date": "2026-07-02", "count": 1},
    ]


def test_truncated_window_flag():
    now = dt.datetime(2026, 7, 3, 12, 0, 0)
    entries = [
        _entry(i, "2026-07-01T00:00:00", "transfer", {"from": "alice", "to": "bob", "amount": "1.000 VIZ"})
        for i in range(2000)
    ]
    out = aggregate_history(entries, "alice", now)
    assert out["range"]["ops_scanned"] == 2000
    assert out["range"]["window"] == "2000ops"
    assert out["range"]["truncated"] is True


def test_empty_history():
    now = dt.datetime(2026, 7, 3, 12, 0, 0)
    out = aggregate_history([], "alice", now)
    assert out["range"]["ops_scanned"] == 0
    assert out["range"]["from"] is None and out["range"]["to"] is None
    assert out["rewards"]["received"] == []
    assert out["rewards"]["given"] == []
    assert out["rewards"]["timeline"] == []
    assert out["activity"]["by_category"] == {"transfer": 0, "award": 0, "governance": 0, "account": 0, "other": 0}
