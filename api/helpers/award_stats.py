"""Materialize a permanent, queryable slice of award activity (receiver+memo
totals) for the write-side platform's "who awarded this post" endpoint.

Two writers, one collection (`kind` tells them apart):
- `award` (real op) — from the live poller via op_stream, so counts and
  initiators show up the instant the op lands in a head block.
- `receive_award` (virtual op, carries the actual SHARES payout) — from the
  archival parser, which is the only path that sees virtual ops (~36s behind
  the head, irreversible blocks only).

Best-effort: failures are logged, never block parsing.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from helpers.db_client import get_db
from helpers.viz import convertShares, vesting_rate

logger = logging.getLogger(__name__)

RATE_TTL = float(os.getenv("AWARD_RATE_TTL", "600"))
_rate_cache: tuple[float, float] = (0.0, 0.0)  # (fetched_at, rate)


def _coll():
    return get_db()[os.getenv("COLLECTION_AWARDS", "award_ops")]


def ensure_indexes() -> None:
    coll = _coll()
    coll.create_index([("receiver", 1), ("memo", 1)])
    coll.create_index([("op_id", 1)], unique=True)


def dispatch(op: dict[str, Any]) -> None:
    """Live path: record a real `award` op (count + initiator, no payout)."""
    try:
        op_type = op["op"][0]
        if op_type != "award":
            return
        body = op["op"][1] if len(op["op"]) > 1 else {}
        doc = {
            "op_id": op["_id"],
            "kind": "award",
            "initiator": body.get("initiator"),
            "receiver": body.get("receiver"),
            "memo": body.get("memo"),
            "energy": body.get("energy"),
            "timestamp": op.get("timestamp"),
        }
        _coll().update_one(
            {"op_id": op["_id"]},
            {"$setOnInsert": doc},
            upsert=True,
        )
    except Exception:
        logger.exception("award_stats.dispatch failed for op %s", op.get("_id"))


def capture_payouts(block: list[dict[str, Any]], blocknum: int) -> None:
    """Archival path: record each `receive_award` virtual op's SHARES payout.

    `block` is get_ops_in_block's list (already normalized by save_block)."""
    for i, tx in enumerate(block):
        op = tx.get("op") or []
        if not op or op[0] != "receive_award":
            continue
        body = op[1] if len(op) > 1 else {}
        shares = body.get("shares")
        # Distinct id namespace from the live path's float ids: the archival
        # op index counts virtual ops too, so positions don't line up.
        op_id = f"ra:{blocknum}:{i}"
        try:
            _coll().update_one(
                {"op_id": op_id},
                {"$setOnInsert": {
                    "op_id": op_id,
                    "kind": "receive_award",
                    "initiator": body.get("initiator"),
                    "receiver": body.get("receiver"),
                    "memo": body.get("memo"),
                    "shares": convertShares(shares) if isinstance(shares, str) else shares,
                    "timestamp": tx.get("timestamp"),
                }},
                upsert=True,
            )
        except Exception:
            logger.exception("award_stats.capture_payouts failed for %s", op_id)


def _cached_rate() -> float | None:
    global _rate_cache
    fetched_at, rate = _rate_cache
    if time.monotonic() - fetched_at < RATE_TTL and fetched_at:
        return rate
    try:
        rate = vesting_rate()
    except Exception:
        logger.exception("award_stats: vesting_rate failed")
        return rate or None
    _rate_cache = (time.monotonic(), rate)
    return rate


def totals(receiver: str, memo: str) -> dict:
    coll = _coll()
    # Pre-`kind` rows are live `award` rows; keep counting them.
    awards = {"receiver": receiver, "memo": memo, "kind": {"$ne": "receive_award"}}
    payouts = {"receiver": receiver, "memo": memo, "kind": "receive_award"}
    agg = list(coll.aggregate([
        {"$match": payouts},
        {"$group": {"_id": None, "shares": {"$sum": "$shares"}}},
    ]))
    total_shares = float(agg[0]["shares"]) if agg else 0.0
    rate = _cached_rate()
    return {
        "count": coll.count_documents(awards),
        "initiators": coll.distinct("initiator", awards),
        "total_shares": total_shares,
        # ponytail: converted at today's vesting rate, not the rate at award
        # time; store the rate per payout row if historical precision matters.
        "total_viz": round(total_shares * rate, 3) if rate is not None else None,
    }
