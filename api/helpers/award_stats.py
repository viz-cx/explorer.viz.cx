"""Materialize a permanent, queryable slice of `award` ops (receiver+memo
totals) for the write-side platform's "who awarded this post" endpoint.

Called from the parser thread via op_stream (sibling to notifications.dispatch).
Best-effort: failures are logged, never block parsing.

No `receive_award` (virtual op) capture: the live poller (parser.live_stream)
never sees virtual ops, only the archival parser does, and that parser doesn't
call emit_block_ops. So there is no live path to the actual VIZ payout amount
today; `total_viz` stays null at the endpoint layer.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from helpers.db_client import get_db

logger = logging.getLogger(__name__)


def _coll():
    return get_db()[os.getenv("COLLECTION_AWARDS", "award_ops")]


def ensure_indexes() -> None:
    coll = _coll()
    coll.create_index([("receiver", 1), ("memo", 1)])
    coll.create_index([("op_id", 1)], unique=True)


def dispatch(op: dict[str, Any]) -> None:
    try:
        op_type = op["op"][0]
        if op_type != "award":
            return
        body = op["op"][1] if len(op["op"]) > 1 else {}
        doc = {
            "op_id": op["_id"],
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


def totals(receiver: str, memo: str) -> dict:
    query = {"receiver": receiver, "memo": memo}
    coll = _coll()
    return {
        "count": coll.count_documents(query),
        "initiators": coll.distinct("initiator", query),
    }
