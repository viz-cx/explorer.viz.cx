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


async def test_ws_unsubscribes_on_disconnect_when_filter_never_matches():
    """A closed client whose filter matches nothing is never sent to, so the
    send path can't notice it is gone; it must still be unsubscribed.

    Needs a real uvicorn server: TestClient cancels the handler on exit, which
    hides the leak."""
    import asyncio

    import uvicorn
    import websockets

    import main

    server = uvicorn.Server(uvicorn.Config(
            main.app, port=0, log_level="error", lifespan="off",
            timeout_graceful_shutdown=1,  # don't hang the suite if the handler leaks
        ))
    task = asyncio.create_task(server.serve())
    try:
        while not server.started:
            await asyncio.sleep(0.01)
        port = server.servers[0].sockets[0].getsockname()[1]
        async with websockets.connect(f"ws://127.0.0.1:{port}/ws/ops?account=nobody"):
            while pubsub.subscriber_count() == 0:
                await asyncio.sleep(0.01)
        for _ in range(200):
            if pubsub.subscriber_count() == 0:
                break
            await asyncio.sleep(0.01)
        assert pubsub.subscriber_count() == 0
    finally:
        server.should_exit = True
        await task


def test_full_queue_drops_op_without_raising_on_the_loop():
    import asyncio

    queue = asyncio.Queue(maxsize=1)
    pubsub._offer(queue, {"n": 1})
    pubsub._offer(queue, {"n": 2})  # slow client: dropped, no QueueFull
    assert queue.qsize() == 1


def test_op_matches_type_and_account_filters():
    transfer = _op(1.0, "transfer", {"from": "alice", "to": "bob"})
    custom = _op(2.0, "custom", {"required_regular_auths": ["carol", "alice"]})
    assert pubsub.op_matches(transfer, None, None)
    assert pubsub.op_matches(transfer, "transfer", "bob")
    assert not pubsub.op_matches(transfer, "award", None)
    assert not pubsub.op_matches(transfer, None, "carol")
    assert pubsub.op_matches(custom, None, "alice")  # account inside a list field
    assert not pubsub.op_matches(_op(3.0, "transfer", {"memo": "alice"}), None, "alice")


async def test_publish_survives_a_subscriber_whose_filter_raises():
    import asyncio

    def boom(_op):
        raise RuntimeError("bad filter")

    _bad_queue, unsub_bad = pubsub.subscribe(boom)
    good_queue, unsub_good = pubsub.subscribe(lambda _op: True)
    try:
        pubsub.publish_op(_op(9.0, "transfer", {}))
        assert (await asyncio.wait_for(good_queue.get(), 1))["_id"] == 9.0
    finally:
        unsub_bad()
        unsub_good()


def test_ws_connects_are_rate_limited_per_ip(client, monkeypatch):
    import pytest
    from starlette.websockets import WebSocketDisconnect

    from endpoints import ws

    monkeypatch.setattr(ws, "WS_CONNECTS_PER_MIN", 2)
    for _ in range(2):
        with client.websocket_connect("/ws/ops"):
            pass
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws/ops"):
        pass
