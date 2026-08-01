"""The dead-block ledger in scripts.backfill_from_info_viz.

Blocks info.viz.world answers "Missing data" for used to be forgotten the moment
the process exited, so every sidecar restart re-fetched the whole hole set at
BACKFILL_SLEEP each. Gap 1 accumulated ~80k of them: one restart burned ~22h
re-proving what it already knew and filled nothing. These tests pin the ledger
that makes that work stick.
"""
import contextlib
import urllib.error

import pytest

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


def test_a_bad_page_never_kills_the_pass(monkeypatch):
    """The sidecar restarts on exit and re-sweeps from BACKFILL_START, so an
    escaping exception is an outage, not a skipped block: a JSONDecodeError at
    80,385,244 killed every gap-1 pass at 81% for a day."""
    def blows_up(num, prev_ts, retries, tx_sleep):
        if num == 102:
            raise ValueError("some page shape we have never seen")
        return _ops(num), "2026-04-01T00:00:00"

    assert _run(monkeypatch, 100, 104, blows_up) == 0
    assert sorted(d["_id"] for d in coll.find({})) == [100, 101, 103, 104]
    assert _ledger_ids() == []  # unknown cause — must stay re-probeable


def test_malformed_source_json_is_a_durable_verdict(monkeypatch):
    """info.viz.world drops an escaping level on op payloads containing a quote
    (block 80,385,244). No retry fixes that, so it belongs in the ledger."""
    def corrupt(num, prev_ts, retries, tx_sleep):
        raise bf.BlockMissing(num, "malformed op JSON at source (...)")

    assert _run(monkeypatch, 100, 102, corrupt) == 0
    assert _ledger_ids() == [100, 101, 102]


def test_ops_table_converts_the_sources_own_bad_json(monkeypatch):
    """Verbatim from info.viz.world's tx page for block 80,385,244: the custom
    op's memo is a quoted phrase, and the page renders the inner quote as
    ``\\&quot;`` where ``\\\\&quot;`` belongs — one backslash short of valid."""
    row = (
        '<tr><td>custom</td><td><div class="view-json" data-type="custom">'
        '{&quot;id&quot;:&quot;V&quot;,&quot;json&quot;:&quot;{\\&quot;t\\&quot;:'
        '\\&quot;\\\\&quot;Ash nazg\\\\&quot; #viz_magic\\&quot;}&quot;}'
        '</div></td></tr>'
    )
    with pytest.raises(bf.BlockMissing) as caught:
        bf._ops_table(row, 80_385_244)
    assert "malformed op JSON" in caught.value.reason


def test_404_is_not_retried_and_is_recorded_as_dead(monkeypatch):
    """A 404 is deterministic: four retries just burn 2+4+8s of backoff to be
    told the same thing. Gap 1 re-probed 16 of them on every pass."""
    calls = []

    class Fake404(urllib.error.HTTPError):
        def __init__(self):
            super().__init__("http://x/", 404, "Not Found", {}, None)

    def opener(req, timeout=None):
        calls.append(req.full_url)
        raise Fake404

    monkeypatch.setattr(bf.urllib.request, "urlopen", opener)
    monkeypatch.setattr(bf.time, "sleep", lambda s: pytest.fail("backed off on a 404"))

    with pytest.raises(bf.BlockMissing) as caught:
        bf.reconstruct(100, None, max_retries=4, tx_sleep=0)
    assert caught.value.reason == "HTTP 404"
    assert len(calls) == 1  # not 4


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
