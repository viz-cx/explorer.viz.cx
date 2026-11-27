"""Real-time head-block emission: flatten_block + start_live_stream."""
import pytest

from parser import live_stream


def test_flatten_block_applies_block_timestamp_to_each_op():
    block = {
        "timestamp": "2026-01-01T00:00:00",
        "transactions": [
            {"operations": [["transfer", {"from": "a"}], ["award", {"x": 1}]]},
            {"operations": [["custom", {}]]},
        ],
    }
    txs = live_stream.flatten_block(block)
    assert [t["op"][0] for t in txs] == ["transfer", "award", "custom"]
    assert all(t["timestamp"] == "2026-01-01T00:00:00" for t in txs)


def test_flatten_block_handles_empty():
    assert live_stream.flatten_block({"transactions": []}) == []
    assert live_stream.flatten_block({}) == []


def test_start_live_stream_emits_only_new_head_blocks(monkeypatch):
    """On boot it starts at the current head (no history replay) and emits each
    new block's real ops exactly once."""
    head_calls = {"n": 0}

    def fake_head():
        head_calls["n"] += 1
        if head_calls["n"] > 1:
            raise KeyboardInterrupt  # break the infinite loop after one pass
        return 100

    blocks = {
        100: {
            "timestamp": "2026-01-01T00:00:00",
            "transactions": [{"operations": [["transfer", {"from": "a", "to": "b"}]]}],
        }
    }
    emitted = []
    monkeypatch.setattr(live_stream, "get_head_block_num", fake_head)
    monkeypatch.setattr(live_stream, "get_block", lambda n: blocks.get(n))
    monkeypatch.setattr(live_stream, "emit_block_ops", lambda n, txs: emitted.append((n, txs)))
    monkeypatch.setattr(live_stream, "sleep", lambda _s: None)

    with pytest.raises(KeyboardInterrupt):
        live_stream.start_live_stream()

    # head=100 with last_emitted seeded to 99 → only block 100 is emitted.
    assert [n for n, _ in emitted] == [100]
    assert emitted[0][1] == [
        {"timestamp": "2026-01-01T00:00:00", "op": ["transfer", {"from": "a", "to": "b"}]}
    ]


def test_start_live_stream_skips_empty_blocks(monkeypatch):
    head_calls = {"n": 0}

    def fake_head():
        head_calls["n"] += 1
        if head_calls["n"] > 1:
            raise KeyboardInterrupt
        return 100

    emitted = []
    monkeypatch.setattr(live_stream, "get_head_block_num", fake_head)
    monkeypatch.setattr(live_stream, "get_block", lambda n: {"timestamp": "t", "transactions": []})
    monkeypatch.setattr(live_stream, "emit_block_ops", lambda n, txs: emitted.append((n, txs)))
    monkeypatch.setattr(live_stream, "sleep", lambda _s: None)

    with pytest.raises(KeyboardInterrupt):
        live_stream.start_live_stream()

    assert emitted == []  # no ops in the block → nothing emitted


def test_start_live_stream_bounds_catchup_and_survives_errors(monkeypatch):
    """After a stall it replays at most MAX_CATCHUP blocks, and an RPC error
    retries instead of killing the thread."""
    heads = iter([100, RuntimeError("node down"), 500])

    def fake_head():
        try:
            value = next(heads)
        except StopIteration:
            raise KeyboardInterrupt from None
        if isinstance(value, Exception):
            raise value
        return value

    seen = []
    monkeypatch.setattr(live_stream, "MAX_CATCHUP", 3)
    monkeypatch.setattr(live_stream, "get_head_block_num", fake_head)
    monkeypatch.setattr(live_stream, "get_block", lambda n: seen.append(n))
    monkeypatch.setattr(live_stream, "sleep", lambda _s: None)

    with pytest.raises(KeyboardInterrupt):
        live_stream.start_live_stream()

    assert seen == [100, 498, 499, 500]


def test_watchdog_alerts_once_per_stale_worker_and_on_recovery(monkeypatch, caplog):
    """Edge-triggered per worker: one error when a heartbeat goes stale, none
    while it stays stale, one warning when it comes back."""
    ages = iter([
        {"live_stream": 1, "parser": None},   # parser not started: ignored
        {"live_stream": 1, "parser": 500},    # parser stale -> error
        {"live_stream": 1, "parser": 900},    # still stale -> silent
        {"live_stream": 1, "parser": 2},      # recovered -> warning
    ])
    current = {}

    def fake_sleep(_s):
        try:
            current.update(next(ages))
        except StopIteration:
            raise KeyboardInterrupt from None

    monkeypatch.setattr(live_stream, "sleep", fake_sleep)
    monkeypatch.setattr(live_stream, "seconds_since_heartbeat", lambda w: current[w])

    with caplog.at_level("WARNING", logger=live_stream.__name__), pytest.raises(KeyboardInterrupt):
        live_stream.start_live_stream_watchdog()

    assert [(r.levelname, r.args[0]) for r in caplog.records] == [
        ("ERROR", "parser"),
        ("WARNING", "parser"),
    ]
