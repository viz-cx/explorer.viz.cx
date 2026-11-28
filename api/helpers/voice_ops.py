"""Frozen snapshot of Voice ("V") posts and Voice Events ("VE") custom ops,
filled once by scripts/backfill_voice_ops.py to feed viz.cx's one-time import.

Deliberately NOT hooked into the parser: ops after the snapshot are ignored.
Delete this module, endpoints/voice.py and the collection once the import is
verified.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from helpers.db_client import get_db
from helpers.op_stream import COUNT_MAX_OPS_IN_BLOCK

logger = logging.getLogger(__name__)

PROTOCOLS = ("V", "VE")


def _coll():
    return get_db()[os.getenv("COLLECTION_VOICE", "voice_ops")]


def ensure_indexes() -> None:
    _coll().create_index([("seq", 1)], unique=True)


def capture(block: list[dict[str, Any]], blocknum: int) -> int:
    """Store every V/VE custom op in a stored block. Returns how many it saw.
    Never raises: bad JSON or a write failure is logged and skipped."""
    seen = 0
    for i, tx in enumerate(block):
        op = tx.get("op") or []
        if len(op) < 2 or op[0] != "custom":
            continue
        body = op[1] or {}
        protocol = body.get("id")
        if protocol not in PROTOCOLS:
            continue
        seq = blocknum * COUNT_MAX_OPS_IN_BLOCK + i
        try:
            # strict=False: some clients put raw newlines inside JSON strings.
            parsed = json.loads(body.get("json") or "", strict=False)
            if not isinstance(parsed, dict):
                raise ValueError("not an object")
            auths = body.get("required_regular_auths") or body.get("required_active_auths") or []
            _coll().update_one(
                {"seq": seq},
                {"$setOnInsert": {
                    "seq": seq,
                    "block": blocknum,
                    "account": auths[0] if auths else None,
                    "protocol": protocol,
                    "timestamp": tx.get("timestamp"),
                    "json": parsed,
                }},
                upsert=True,
            )
            seen += 1
        except Exception:
            logger.warning("voice_ops: skipped seq %s (bad json or write)", seq, exc_info=True)
    return seen


def page(after: int, limit: int) -> list[dict]:
    return list(_coll().find({"seq": {"$gt": after}}, {"_id": 0}).sort("seq", 1).limit(limit))
