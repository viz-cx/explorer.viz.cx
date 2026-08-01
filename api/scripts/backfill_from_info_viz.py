"""Backfill the unrecoverable block hole by scraping info.viz.world.

The 79,105,831–80,679,604 hole cannot be filled from any RPC node (their
account_history op window has long since slid past it — see
``scripts/backfill_blocks.py`` and memory:viz-node-situation). But
**info.viz.world** runs its own indexer DB that still serves that range. This
script rebuilds the exact stored block shape (identical to
``helpers.mongo.save_block``) from its server-rendered HTML and writes the
missing blocks into Mongo.

It is the validated production counterpart to ``scripts/scrape_info_viz_prototype.py``
(which proved the reconstruction is byte-for-byte correct against golden docs).

Design
------
* **Polite / slow by default** — sequential (never concurrent) with a
  per-block sleep (``BACKFILL_SLEEP``, default 1.0s) and a per-tx sleep, plus
  retry-with-backoff. We are a guest on someone else's site; do not hammer it.
* **Idempotent / resumable** — blocks already present are skipped; re-run after
  any interruption fills only what is still missing.
* **Remembers dead blocks** — a block info.viz.world answers "Missing data" for
  is recorded in a ledger collection (``<COLLECTION>.unavailable``) and skipped
  on every later run. Without this, a restart re-fetches the whole
  known-unavailable set at ``BACKFILL_SLEEP`` each — gap 1 accumulated ~80k dead
  blocks, so a single restart burned ~22h re-proving them (observed 2026-08-01,
  frontier crawled 79.78M→80.06M with ``filled=0``). Only the durable
  "Missing data" verdict is recorded; transient fetch errors are not.
* **Sequential prev-timestamp carry** — VIZ block interval is 3s; a signed op
  (and the virtual ops it generates) carries the *previous* block's formation
  time, while block-level vops (validator_reward) carry this block's own time.
  Walking in order, we always know block N−1's formation time.
* **Hole-tolerant** — blocks info.viz.world itself lacks ("Missing data") are
  recorded as still-missing (its own gap is 79,499,598–79,500,439, ~842 blocks).
* **--validate / VALIDATE=1** — read-only dry run: reconstruct each block and
  diff against the golden DB doc (``api.viz.cx/blocks/N``) instead of writing.
  Use over an overlap range to prove the converter before a real run.

Usage (run from the app root)::

    # read-only correctness gate over an overlap range (no DB needed):
    VALIDATE=1 BACKFILL_START=80679605 BACKFILL_END=80690000 \
        python -m scripts.backfill_from_info_viz

    # real backfill of the hole (needs MONGO/DB_NAME/COLLECTION, like the parser):
    python -m scripts.backfill_from_info_viz
    BACKFILL_SLEEP=2.0 python -m scripts.backfill_from_info_viz   # extra gentle

Running on axveer (production, ~18 days at the gentle 1.0s default)
------------------------------------------------------------------
The deployed app container (service ``viz-cx-api``) already has the code, the
``MONGO``/``DB_NAME=viz-cx-api``/``COLLECTION=blocks`` env, and network reach to
both ``mongo`` and info.viz.world. Run inside it under tmux so it survives the
SSH session (it is resumable, so a container redeploy mid-run is recoverable —
just re-launch and it skips what's already filled)::

    ssh deploy@5.223.75.86 -p 666
    tmux new -s backfill
    cid=$(docker ps --filter name=viz-cx-api --format '{{.ID}}' | head -1)
    docker exec -it "$cid" sh -c 'cd /code && BACKFILL_SLEEP=1.0 \
        python -m scripts.backfill_from_info_viz 2>&1 | tee /tmp/backfill.log'
    # Ctrl-b d to detach; `tmux attach -t backfill` to check on it.

If the script is not yet in the running image, either redeploy
(``kamal deploy``) or hot-copy it without a redeploy::

    scp scripts/backfill_from_info_viz.py deploy@5.223.75.86:/tmp/ -P 666
    # then on the host:
    cid=$(docker ps -qf name=viz-cx-api | head -1)
    docker cp /tmp/backfill_from_info_viz.py "$cid":/code/scripts/

Environment
-----------
MONGO, DB_NAME, COLLECTION   app config (same as the parser); only for writes.
BACKFILL_START / BACKFILL_END  inclusive range (defaults to the hole).
BACKFILL_SLEEP               seconds between blocks (default 1.0).
BACKFILL_TX_SLEEP            seconds between tx-page fetches (default 0.3).
BACKFILL_MAX_RETRIES         retries per HTTP fetch (default 4).
BACKFILL_BATCH               blocks per insert flush / progress line (default 200).
BACKFILL_RETRY_UNAVAILABLE   "1" → ignore the dead-block ledger and re-probe
                             every hole (use for an occasional sweep in case
                             info.viz.world has since filled its own gaps).
BACKFILL_SEED_DEAD_UPTO      block number → one-shot migration, no scraping: mark
                             every block in START..N that is absent from the
                             blocks collection as dead, then exit. N must be a
                             frontier a previous run already swept past, so
                             "absent" really means "attempted and not served".
VALIDATE                     "1" → dry-run diff vs golden, no writes.
"""

import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request

INFO = "https://info.viz.world"
GOLDEN = "https://api.viz.cx/blocks"
UA = {"User-Agent": "viz.cx-archive-recovery/1.0 (+https://viz.cx; restoring the 79.1M-80.68M hole)"}

DEFAULT_START = 79_105_831
DEFAULT_END = 80_679_604
BLOCK_VOP_TRX_IN_BLOCK = 65535
BLOCK_INTERVAL_S = 3

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _get(url: str, max_retries: int) -> str:
    """GET with backoff. info.viz.world rate-limits with empty 200s under load,
    so an empty body is treated as a retryable transient failure."""
    delay = 2.0
    last = None
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", "replace")
            if body.strip():
                return body
            last = "empty body (rate-limited?)"
        except Exception as exc:  # noqa: BLE001
            last = exc
        if attempt < max_retries:
            time.sleep(min(delay, 20.0))
            delay *= 2
    raise RuntimeError(f"GET {url} failed after {max_retries}: {last}")

# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

_RE_OP_ROW = re.compile(
    r'<tr[^>]*>\s*<td>(?P<type_cell>.*?)</td>\s*'
    r'<td><div class="view-json" data-type="[^"]*">(?P<json>.*?)</div></td>',
    re.S,
)
_RE_VIRTUAL = re.compile(r'title="Виртуальная"')


def _parse_ops_table(section_html: str) -> list[tuple[str, dict, bool]]:
    out = []
    for m in _RE_OP_ROW.finditer(section_html):
        type_cell = m.group("type_cell")
        is_virtual = bool(_RE_VIRTUAL.search(type_cell))
        t = re.sub(r"<[^>]+>", "", type_cell).strip()
        op_json = json.loads(html.unescape(m.group("json")))
        out.append((t, op_json, is_virtual))
    return out


def _section(doc: str, heading: str) -> str:
    i = doc.find(f">{heading}<")
    if i == -1:
        return ""
    end = doc.find("</table>", i)
    return doc[i: end if end != -1 else len(doc)]


def _block_timestamp(doc: str) -> str:
    m = re.search(r"Время формирования:.*?<span[^>]*>(.*?)</span>", doc, re.S)
    raw = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""
    mm = re.match(r"(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2})", raw)
    if not mm:
        return raw
    d, mo, y, t = mm.groups()
    return f"{y}-{mo}-{d}T{t}"


def _tx_hashes(doc: str) -> list[str]:
    sect = _section(doc, "Транзакции")
    return re.findall(r"/explorer/tx/([0-9A-Fa-f]+)/", sect) if sect else []


def _minus_interval(iso: str) -> str:
    try:
        return (dt.datetime.fromisoformat(iso) - dt.timedelta(seconds=BLOCK_INTERVAL_S)).isoformat()
    except ValueError:
        return iso

# ---------------------------------------------------------------------------
# Reconstruction  (proven byte-identical to get_ops_in_block in the prototype)
# ---------------------------------------------------------------------------

class BlockMissing(Exception):
    """info.viz.world has no data for this block (its own hole)."""


def reconstruct(num: int, prev_ts: str | None, max_retries: int, tx_sleep: float):
    """Return (ops, formation_ts). Raises BlockMissing if the source lacks it.

    ``prev_ts`` is block N−1's formation time (ISO); signed ops use it. If None,
    falls back to block_ts − one interval.
    """
    doc = _get(f"{INFO}/explorer/block/{num}/", max_retries)
    if "Missing data" in doc:
        raise BlockMissing(num)
    block_ts = _block_timestamp(doc)
    tx_ts = prev_ts or _minus_interval(block_ts)
    ops: list[dict] = []

    for trx_in_block, txhash in enumerate(_tx_hashes(doc)):
        if tx_sleep:
            time.sleep(tx_sleep)
        txdoc = _get(f"{INFO}/explorer/tx/{txhash}/", max_retries)
        op_in_trx = -1
        vop_seq = 0
        for op_type, op_json, is_virtual in _parse_ops_table(_section(txdoc, "Операции")):
            if not is_virtual:
                op_in_trx += 1
                vop_seq = 0
                ops.append({
                    "trx_id": txhash.lower(), "trx_in_block": trx_in_block,
                    "op_in_trx": op_in_trx, "virtual_op": 0,
                    "timestamp": tx_ts, "op": [op_type, op_json],
                })
            else:
                vop_seq += 1
                ops.append({
                    "trx_id": txhash.lower(), "trx_in_block": trx_in_block,
                    "op_in_trx": max(op_in_trx, 0), "virtual_op": vop_seq,
                    "timestamp": tx_ts, "op": [op_type, op_json],
                })

    vop_seq = 0
    for op_type, op_json, _ in _parse_ops_table(_section(doc, "Виртуальные операции")):
        vop_seq += 1
        ops.append({
            "trx_in_block": BLOCK_VOP_TRX_IN_BLOCK, "op_in_trx": 0,
            "virtual_op": vop_seq, "timestamp": block_ts, "op": [op_type, op_json],
        })

    return ops, block_ts


def to_storage_doc(num: int, ops: list[dict]) -> dict:
    """Coerce ISO timestamps to datetime so the doc matches save_block output."""
    for op in ops:
        ts = op["timestamp"]
        if isinstance(ts, str):
            op["timestamp"] = dt.datetime.fromisoformat(ts)
    return {"_id": num, "block": ops}

# ---------------------------------------------------------------------------
# Validation (read-only) vs golden DB docs
# ---------------------------------------------------------------------------

def _golden(num: int, max_retries: int) -> dict | None:
    try:
        return json.loads(_get(f"{GOLDEN}/{num}", max_retries))
    except Exception:  # noqa: BLE001
        return None


def _diff(ops: list[dict], gold_block: list[dict]) -> list[str]:
    issues = []
    if len(ops) != len(gold_block):
        issues.append(f"op count: scraped {len(ops)} vs golden {len(gold_block)}")
    for i, (r, g) in enumerate(zip(ops, gold_block, strict=False)):
        for k in ("op", "trx_id", "trx_in_block", "op_in_trx", "virtual_op", "timestamp"):
            if r.get(k) != g.get(k):
                issues.append(f"op[{i}].{k}: {r.get(k)!r} vs {g.get(k)!r}")
    return issues

# ---------------------------------------------------------------------------
# Dead-block ledger seeding (one-shot migration)
# ---------------------------------------------------------------------------

def _seed_dead(coll, dead, start: int, upto: int, batch: int) -> int:
    """Backfill the ledger for a range an earlier, pre-ledger run already swept.

    Anything in ``start..upto`` still absent from the blocks collection was
    fetched and refused by the source, so it is dead by construction. A handful
    may instead be transient fetch failures (the run that swept gap 1 logged 39
    against ~80k genuine holes); ``BACKFILL_RETRY_UNAVAILABLE=1`` re-probes
    everything and recovers them.
    """
    from pymongo.errors import BulkWriteError  # noqa: PLC0415

    print(f"SEED DEAD LEDGER: {start:,}–{upto:,} — no scraping", flush=True)
    seeded = scanned = 0
    now = dt.datetime.now(dt.UTC)
    lo = start
    while lo <= upto:
        hi = min(lo + batch * 50 - 1, upto)
        present = {d["_id"] for d in coll.find({"_id": {"$gte": lo, "$lte": hi}}, {"_id": 1})}
        docs = [{"_id": n, "at": now} for n in range(lo, hi + 1) if n not in present]
        scanned += hi - lo + 1
        if docs:
            try:
                seeded += len(dead.insert_many(docs, ordered=False).inserted_ids)
            except BulkWriteError as bwe:
                seeded += bwe.details.get("nInserted", 0)
        lo = hi + 1
    print(f"seeded {seeded:,} dead block(s) out of {scanned:,} scanned", flush=True)
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    start = int(os.getenv("BACKFILL_START", str(DEFAULT_START)))
    end = int(os.getenv("BACKFILL_END", str(DEFAULT_END)))
    sleep_s = float(os.getenv("BACKFILL_SLEEP", "1.0"))
    tx_sleep = float(os.getenv("BACKFILL_TX_SLEEP", "0.3"))
    max_retries = int(os.getenv("BACKFILL_MAX_RETRIES", "4"))
    batch = int(os.getenv("BACKFILL_BATCH", "200"))
    validate = os.getenv("VALIDATE") == "1"
    retry_unavailable = os.getenv("BACKFILL_RETRY_UNAVAILABLE") == "1"
    if start > end:
        print(f"nothing to do: start {start} > end {end}", flush=True)
        return 0

    mode = "VALIDATE (read-only, diff vs golden)" if validate else "BACKFILL (writes to Mongo)"
    print(f"{mode}: blocks {start:,}–{end:,} ({end - start + 1:,}); "
          f"sleep={sleep_s}s tx_sleep={tx_sleep}s", flush=True)

    # Writers need the DB handle; readers (validate) never touch Mongo.
    coll = dead = None
    if not validate:
        from helpers.mongo import coll as _coll  # noqa: PLC0415
        coll = _coll
        # Sibling collection "<COLLECTION>.unavailable" — the dead-block ledger.
        dead = _coll["unavailable"]

    seed_upto = int(os.getenv("BACKFILL_SEED_DEAD_UPTO", "0"))
    if seed_upto and coll is not None:
        return _seed_dead(coll, dead, start, min(seed_upto, end), batch)

    filled = ok = mism = unavailable = errors = known = 0
    opfields = {"types": {}, "max_trx_in_block": 0, "max_op_in_trx": 0}
    missing_ranges: list = []
    buf: list = []
    dead_buf: list = []
    prev_num = prev_ts = None

    def record_missing(n):
        if missing_ranges and missing_ranges[-1][1] == n - 1:
            missing_ranges[-1][1] = n
        else:
            missing_ranges.append([n, n])

    def record_dead(n):
        """Persist the source's durable 'Missing data' verdict so later runs
        skip this block instead of re-proving it one sleep at a time."""
        record_missing(n)
        if dead is not None:
            dead_buf.append({"_id": n, "at": dt.datetime.now(dt.UTC)})

    def _insert_many(target, docs):
        """Bulk insert tolerating duplicates; returns the number inserted."""
        from pymongo.errors import BulkWriteError  # noqa: PLC0415
        try:
            return len(target.insert_many(docs, ordered=False).inserted_ids)
        except BulkWriteError as bwe:
            return bwe.details.get("nInserted", 0)

    def flush():
        nonlocal filled
        if buf and coll is not None:
            filled += _insert_many(coll, buf)
        buf.clear()
        if dead_buf and dead is not None:
            _insert_many(dead, dead_buf)
        dead_buf.clear()

    def _ids(target, lo, hi):
        return {d["_id"] for d in target.find({"_id": {"$gte": lo, "$lte": hi}}, {"_id": 1})}

    def present_ids(lo, hi):
        if coll is None:
            return set()
        return _ids(coll, lo, hi)

    def dead_ids(lo, hi):
        """Blocks already proven absent at the source — skip unless re-probing."""
        if dead is None or retry_unavailable:
            return set()
        return _ids(dead, lo, hi)

    try:
        lo = start
        while lo <= end:
            hi = min(lo + batch - 1, end)
            already = present_ids(lo, hi)
            known_dead = dead_ids(lo, hi)
            for num in range(lo, hi + 1):
                if num in already:
                    prev_num, prev_ts = None, None  # ts unknown across skips; re-derive
                    continue
                if num in known_dead:
                    known += 1
                    record_missing(num)
                    prev_num, prev_ts = None, None
                    continue
                pts = prev_ts if prev_num == num - 1 else None
                try:
                    ops, formation_ts = reconstruct(num, pts, max_retries, tx_sleep)
                except BlockMissing:
                    unavailable += 1
                    record_dead(num)
                    prev_num, prev_ts = num, None
                    continue
                except RuntimeError as exc:
                    errors += 1
                    record_missing(num)
                    print(f"  ! {exc}", flush=True)
                    prev_num = None
                    continue
                prev_num, prev_ts = num, formation_ts
                for op in ops:
                    opfields["types"][op["op"][0]] = opfields["types"].get(op["op"][0], 0) + 1
                    if op["trx_in_block"] != BLOCK_VOP_TRX_IN_BLOCK:
                        opfields["max_trx_in_block"] = max(opfields["max_trx_in_block"], op["trx_in_block"])
                    opfields["max_op_in_trx"] = max(opfields["max_op_in_trx"], op["op_in_trx"])

                if validate:
                    gold = _golden(num, max_retries)
                    if gold is None:
                        print(f"  {num}: no golden (not in DB) — {len(ops)} ops, skipped", flush=True)
                    else:
                        issues = _diff(ops, gold["block"])
                        if issues:
                            mism += 1
                            print(f"  {num}: ⚠️  {len(issues)} diff(s):", flush=True)
                            for s in issues[:10]:
                                print(f"        - {s}", flush=True)
                        else:
                            ok += 1
                else:
                    buf.append(to_storage_doc(num, ops))
                if sleep_s:
                    time.sleep(sleep_s)
            flush()
            done = hi - start + 1
            tail = (f"ok={ok} mism={mism}" if validate else f"filled={filled}")
            print(f"… {hi:,} ({tail} unavail={unavailable} known-dead={known} "
                  f"err={errors}) {done * 100 // (end - start + 1)}%", flush=True)
            lo = hi + 1
    except KeyboardInterrupt:
        flush()
        print("\ninterrupted — flushed progress so far", flush=True)

    print("\n=== summary ===", flush=True)
    print(f"range         : {start:,}–{end:,} ({end - start + 1:,})", flush=True)
    if validate:
        print(f"exact matches : {ok}", flush=True)
        print(f"mismatches    : {mism}", flush=True)
    else:
        print(f"newly filled  : {filled:,}", flush=True)
    print(f"unavailable   : {unavailable:,} (info.viz.world's own hole, newly proven)", flush=True)
    print(f"known dead    : {known:,} (skipped via ledger, not re-fetched)", flush=True)
    print(f"fetch errors  : {errors:,}", flush=True)
    print(f"op types seen : {len(opfields['types'])} -> {sorted(opfields['types'])}", flush=True)
    print(f"max trx_in_block={opfields['max_trx_in_block']} max op_in_trx={opfields['max_op_in_trx']}", flush=True)
    if missing_ranges:
        print(f"still missing : {len(missing_ranges)} range(s):", flush=True)
        for a, b in missing_ranges:
            print(f"  {a:,}–{b:,} ({b - a + 1:,})", flush=True)
    return 1 if (validate and mism) else 0


if __name__ == "__main__":
    sys.exit(main())
