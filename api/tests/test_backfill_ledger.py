"""The dead-block ledger in scripts.backfill_from_info_viz.

Blocks info.viz.world answers "Missing data" for used to be forgotten the moment
the process exited, so every sidecar restart re-fetched the whole hole set at
BACKFILL_SLEEP each. Gap 1 accumulated ~80k of them: one restart burned ~22h
re-proving what it already knew and filled nothing. These tests pin the ledger
that makes that work stick.
"""
import contextlib

import scripts.backfill_from_info_viz as bf
from helpers.mongo import coll


def _run(monkeypatch, start, end, reconstruct, **env):
    """Run main() over a range with a stubbed source and a fast sleep."""
    monkeypatch.setenv("BACKFILL_START", str(start))
    monkeypatch.setenv("BACKFILL_END", str(end))
    monkeypatch.setenv("BACKFILL_SLEEP", "0")
    monkeypatch.setenv("BACKFILL_TX_SLEEP", "0")
    monkeypatch.setenv("BACKFILL_BATCH", "10")
    monkeypatch.delenv("VALIDATE", raising=False)
    monkeypatch.delenv("BACKFILL_RETRY_UNAVAILABLE", raising=False)
    monkeypatch.delenv("BACKFILL_SEED_DEAD_UPTO", raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, str(v))
    monkeypatch.setattr(bf, "reconstruct", reconstruct)
    return bf.main()


def _ops(num):
    return [{
        "trx_in_block": bf.BLOCK_VOP_TRX_IN_BLOCK, "op_in_trx": 0, "virtual_op": 1,
        "timestamp": "2026-04-01T00:00:00", "op": ["validator_reward", {"block": num}],
    }]


def _ledger_ids():
    return sorted(d["_id"] for d in coll["unavailable"].find({}))


def test_missing_blocks_are_recorded_in_the_ledger(monkeypatch):
    def source(num, prev_ts, retries, tx_sleep):
        if num % 2:
            raise bf.BlockMissing(num)
        return _ops(num), "2026-04-01T00:00:00"

    assert _run(monkeypatch, 100, 109, source) == 0
    assert _ledger_ids() == [101, 103, 105, 107, 109]
    assert sorted(d["_id"] for d in coll.find({})) == [100, 102, 104, 106, 108]


def test_second_run_skips_known_dead_without_refetching(monkeypatch):
    def source(num, prev_ts, retries, tx_sleep):
        raise bf.BlockMissing(num)

    _run(monkeypatch, 100, 104, source)
    assert _ledger_ids() == [100, 101, 102, 103, 104]

    # The whole point: a restart must not touch the source again.
    def forbidden(num, prev_ts, retries, tx_sleep):
        raise AssertionError(f"re-fetched known-dead block {num}")

    assert _run(monkeypatch, 100, 104, forbidden) == 0


def test_retry_unavailable_reprobes_the_ledger(monkeypatch):
    def missing(num, prev_ts, retries, tx_sleep):
        raise bf.BlockMissing(num)

    _run(monkeypatch, 100, 102, missing)

    # The source has since filled its own hole; the sweep must pick it up.
    def now_served(num, prev_ts, retries, tx_sleep):
        return _ops(num), "2026-04-01T00:00:00"

    _run(monkeypatch, 100, 102, now_served, BACKFILL_RETRY_UNAVAILABLE="1")
    assert sorted(d["_id"] for d in coll.find({})) == [100, 101, 102]


def test_transient_fetch_errors_are_not_recorded_as_dead(monkeypatch):
    """A RuntimeError is exhausted retries, not a verdict from the source —
    marking it dead would permanently drop a recoverable block."""
    def flaky(num, prev_ts, retries, tx_sleep):
        raise RuntimeError(f"GET block/{num} failed after 4: timeout")

    assert _run(monkeypatch, 100, 102, flaky) == 0
    assert _ledger_ids() == []


def test_present_blocks_are_never_marked_dead(monkeypatch):
    coll.insert_one({"_id": 100, "block": []})

    def source(num, prev_ts, retries, tx_sleep):
        raise bf.BlockMissing(num)

    _run(monkeypatch, 100, 102, source)
    assert _ledger_ids() == [101, 102]


def test_run_exits_after_one_pass_by_default(monkeypatch):
    calls = []
    monkeypatch.delenv("BACKFILL_IDLE_SLEEP", raising=False)
    monkeypatch.delenv("VALIDATE", raising=False)
    monkeypatch.delenv("BACKFILL_SEED_DEAD_UPTO", raising=False)
    monkeypatch.setattr(bf, "main", lambda: calls.append(1) or 0)
    assert bf.run() == 0
    assert len(calls) == 1


def test_run_idles_between_passes_instead_of_exiting(monkeypatch):
    """Exiting hands control to --restart unless-stopped, which re-sweeps the
    whole range immediately; gap2 burned 513 restarts that way."""
    calls, slept = [], []

    def fake_main():
        calls.append(1)
        if len(calls) == 3:
            raise KeyboardInterrupt
        return 0

    monkeypatch.setenv("BACKFILL_IDLE_SLEEP", "42")
    monkeypatch.delenv("VALIDATE", raising=False)
    monkeypatch.delenv("BACKFILL_SEED_DEAD_UPTO", raising=False)
    monkeypatch.setattr(bf, "main", fake_main)
    monkeypatch.setattr(bf.time, "sleep", lambda s: slept.append(s))

    with contextlib.suppress(KeyboardInterrupt):
        bf.run()
    assert len(calls) == 3
    assert slept == [42, 42]


def test_seed_run_never_idles(monkeypatch):
    """A one-shot migration must not turn into a permanent loop."""
    calls = []
    monkeypatch.setenv("BACKFILL_IDLE_SLEEP", "42")
    monkeypatch.setenv("BACKFILL_SEED_DEAD_UPTO", "100")
    monkeypatch.delenv("VALIDATE", raising=False)
    monkeypatch.setattr(bf, "main", lambda: calls.append(1) or 0)
    assert bf.run() == 0
    assert len(calls) == 1


def test_seed_dead_upto_marks_absent_blocks_without_scraping(monkeypatch):
    for n in (100, 102, 104):
        coll.insert_one({"_id": n, "block": []})

    def forbidden(num, prev_ts, retries, tx_sleep):
        raise AssertionError("seeding must not hit the source")

    # Seeds 100..104 only; 105..109 is unswept territory and must stay open.
    assert _run(monkeypatch, 100, 109, forbidden, BACKFILL_SEED_DEAD_UPTO=104) == 0
    assert _ledger_ids() == [101, 103]
