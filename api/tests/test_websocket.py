"""Tests for /ws/ops subscriptions."""
import datetime as dt

from helpers import pubsub


def _op(op_id: float, op_type: str, body: dict, ts: dt.datetime | None = None) -> dict:
    return {
        "_id": op_id,
        "timestamp": ts or dt.datetime(2026, 1, 1, 10, 0, 0, tzinfo=dt.UTC),
        "op": [op_type, body],
    }


def test_ws_streams_unfiltered_ops(client):
    with client.websocket_connect("/ws/ops") as ws:
        pubsub.publish_op(_op(1.0, "transfer", {"from": "alice", "to": "bob"}))
        msg = ws.receive_json()
        assert msg["op_type"] == "transfer"
        assert msg["op_id"] == 1.0
        assert msg["body"]["from"] == "alice"


def test_ws_filters_by_op_type(client):
    with client.websocket_connect("/ws/ops?op_type=transfer") as ws:
        pubsub.publish_op(_op(2.0, "vote", {"voter": "alice"}))
        pubsub.publish_op(_op(2.1, "transfer", {"from": "alice", "to": "bob"}))
        msg = ws.receive_json()
        assert msg["op_id"] == 2.1
        assert msg["op_type"] == "transfer"


def test_ws_filters_by_account(client):
    with client.websocket_connect("/ws/ops?account=alice") as ws:
        pubsub.publish_op(_op(3.0, "transfer", {"from": "carol", "to": "bob"}))
        pubsub.publish_op(_op(3.1, "transfer", {"from": "alice", "to": "bob"}))
        msg = ws.receive_json()
        assert msg["op_id"] == 3.1


def test_ws_unsubscribes_on_disconnect(client):
    assert pubsub.subscriber_count() == 0
    with client.websocket_connect("/ws/ops") as ws:
        assert pubsub.subscriber_count() == 1
        pubsub.publish_op(_op(4.0, "transfer", {"from": "alice"}))
        ws.receive_json()
    assert pubsub.subscriber_count() == 0


def test_recent_ops_newest_first_and_capped(client):
    pubsub._recent.clear()
    for i in range(pubsub.RECENT_OPS + 5):
        pubsub.publish_op(_op(float(i), "transfer", {"from": "alice"}))
    rows = client.get("/ops/recent").json()
    assert len(rows) == pubsub.RECENT_OPS
    assert rows[0]["op_id"] == float(pubsub.RECENT_OPS + 4)
    assert rows[0]["op_type"] == "transfer"
    assert rows[0]["timestamp"] == "2026-01-01T10:00:00+00:00"
    assert rows[-1]["op_id"] == 5.0
