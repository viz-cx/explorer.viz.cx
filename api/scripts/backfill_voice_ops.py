"""One-time fill of the voice_ops snapshot (helpers/voice_ops.py) from the
blocks archive. Idempotent (unique seq), resumable via BACKFILL_START.

Usage (run from the app root, in a sidecar — not the API container)::

    python -m scripts.backfill_voice_ops            # full archive
    VOICE_EXPLAIN=1 python -m scripts.backfill_voice_ops   # print plan for the first range, exit
    BACKFILL_START=40000000 python -m scripts.backfill_voice_ops

Ends by idling (BACKFILL_IDLE_SLEEP) so `--restart unless-stopped` does not re-sweep.
"""
import json
import os
import sys
from time import sleep

from helpers import voice_ops
from helpers.mongo import coll

STEP = int(os.getenv("BACKFILL_STEP", "100000"))
INDEX = [("_id", 1), ("block.op.0", 1), ("block.op.1.id", 1)]


def _query(lo: int, hi: int) -> dict:
    return {"_id": {"$gte": lo, "$lt": hi}, "block.op.1.id": {"$in": list(voice_ops.PROTOCOLS)}}


def run(start: int, end: int) -> int:
    voice_ops.ensure_indexes()
    total = 0
    for lo in range(start, end + 1, STEP):
        hi = min(lo + STEP, end + 1)
        found = 0
        for doc in coll.find(_query(lo, hi)).hint(INDEX).sort("_id", 1):
            found += voice_ops.capture(doc["block"], doc["_id"])
        total += found
        print(f"range {lo}-{hi - 1}: {found} ops (total {total})", flush=True)
    return total


def main() -> None:
    last = coll.find_one(sort=[("_id", -1)])
    end = int(os.getenv("BACKFILL_END") or (last["_id"] if last else 0))
    start = int(os.getenv("BACKFILL_START", "1"))
    if os.getenv("VOICE_EXPLAIN"):
        plan = coll.find(_query(start, start + STEP)).hint(INDEX).explain()
        print(json.dumps(plan.get("executionStats", plan.get("queryPlanner")), default=str, indent=1))
        sys.exit(0)
    print(f"voice backfill {start}-{end}", flush=True)
    total = run(start, end)
    print(f"DONE: {total} ops; voice_ops count = {voice_ops._coll().count_documents({})}", flush=True)
    sleep(int(os.getenv("BACKFILL_IDLE_SLEEP", "86400000")))


if __name__ == "__main__":
    main()
