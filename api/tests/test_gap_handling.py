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


def test_save_block_duplicate_is_idempotent():
    """Re-saving an already-stored block must be a no-op, not raise. A
    DuplicateKeyError here previously crash-looped the parser (tip frozen at
    81,288,426): its in-memory position desynced from the DB and every retry
    re-inserted the same _id."""
    from helpers import mongo

    mongo.save_block([], 4242)
    mongo.save_block([], 4242)  # must not raise
    assert mongo.get_block(4242) == {"_id": 4242, "block": []}
