"""Tests for parser start-block resolution and block-storage behaviour.

Covers resolve_start_block (jump-past-hole logic driven by PARSER_START_BLOCK)
and save_block. Real-time emission now lives in parser.live_stream and is
covered by test_live_stream.
"""

from parser.parser import resolve_start_block


def test_resolve_start_block_no_env(monkeypatch):
    monkeypatch.delenv("PARSER_START_BLOCK", raising=False)
    assert resolve_start_block(100) == 100


def test_resolve_start_block_jumps_ahead(monkeypatch):
    monkeypatch.setenv("PARSER_START_BLOCK", "500")
    assert resolve_start_block(100) == 499  # parser resumes at 500


def test_resolve_start_block_never_rewinds(monkeypatch):
    monkeypatch.setenv("PARSER_START_BLOCK", "50")
    assert resolve_start_block(100) == 100


def test_save_block_empty_uses_explicit_number():
    """An empty block (no ops to derive a number from) must store under the
    caller-supplied number, not crash. This is what kept the parser stuck."""
    from helpers import mongo

    mongo.save_block([], 42)
    assert mongo.get_block(42) == {"_id": 42, "block": []}
    assert mongo.get_last_blocknum() == 42


def test_save_block_nonempty_explicit_number_wins():
    from helpers import mongo

    block = [{"block": 7, "timestamp": "2026-06-29T08:00:00", "op": ["x", {}]}]
    mongo.save_block(block, 7)
    stored = mongo.get_block(7)
    assert stored["_id"] == 7
    assert "block" not in stored["block"][0]  # per-op block field stripped


def test_missing_block_is_404_not_500(client):
    """The archive has holes by design, so a block we never stored is an
    ordinary 404. It used to be a 500: find_one returned None and the endpoint's
    `-> dict` annotation blew up in response validation, turning every probe of
    a hole block into an unhandled exception."""
    response = client.get("/blocks/79999999")
    assert response.status_code == 404


def test_stored_block_is_returned(client):
    from helpers import mongo

    mongo.save_block([], 4243)
    response = client.get("/blocks/4243")
    assert response.status_code == 200
    assert response.json() == {"_id": 4243, "block": []}


def test_save_block_duplicate_is_idempotent():
    """Re-saving an already-stored block must be a no-op, not raise. A
    DuplicateKeyError here previously crash-looped the parser (tip frozen at
    81,288,426): its in-memory position desynced from the DB and every retry
    re-inserted the same _id."""
    from helpers import mongo

    mongo.save_block([], 4242)
    mongo.save_block([], 4242)  # must not raise
    assert mongo.get_block(4242) == {"_id": 4242, "block": []}


def test_parser_advances_when_side_work_fails(monkeypatch):
    """Best-effort work after a save must never hold the position back: that
    re-inserted the same block forever and froze the tip (81,288,426, ~16h)."""
    import pytest

    from helpers import live_health
    from parser import parser

    calls = {"n": 0}

    def fake_tip():
        calls["n"] += 1
        if calls["n"] > 2:
            raise KeyboardInterrupt  # break the infinite loop
        return 2

    def boom(*_a):
        raise RuntimeError("side work failed")

    saved = []
    monkeypatch.setattr(parser, "get_last_blocknum", lambda: 0)
    monkeypatch.setattr(parser, "get_last_block_in_chain", fake_tip)
    monkeypatch.setattr(parser, "get_ops_in_block", lambda n, _v: [])
    monkeypatch.setattr(parser, "save_block", lambda block, n: saved.append(n))
    monkeypatch.setattr(parser, "_update_key_index", boom)
    monkeypatch.setattr(parser, "sleep", lambda _s: None)
    monkeypatch.delenv("PARSER_START_BLOCK", raising=False)

    with pytest.raises(KeyboardInterrupt):
        parser.start_parsing()

    assert saved == [1, 2]  # block 1 saved once, then moved on to 2
    assert live_health.seconds_since_heartbeat("parser") is not None


def test_update_key_index_refreshes_only_accounts_touched_in_the_block(_viz, _mongo):
    from parser import parser

    _viz.rpc.get_accounts.return_value = [
        {"name": "newbie", "master_authority": {"key_auths": [["VIZ1", 1]]},
         "active_authority": {"key_auths": [["VIZ2", 1]]},
         "regular_authority": {"key_auths": [["VIZ1", 1]]}},
    ]
    parser._update_key_index([
        {"op": ["transfer", {"from": "alice", "to": "bob"}]},
        {"op": ["account_create", {"new_account_name": "newbie"}]},
    ])

    _viz.rpc.get_accounts.assert_called_once_with(["newbie"])
    assert _mongo["viztest"]["account_keys"].find_one({"_id": "newbie"})["keys"] == ["VIZ1", "VIZ2"]


def test_update_key_index_failure_does_not_raise(_viz):
    from parser import parser

    _viz.rpc.get_accounts.side_effect = RuntimeError("node down")
    parser._update_key_index([{"op": ["account_update", {"account": "alice"}]}])
