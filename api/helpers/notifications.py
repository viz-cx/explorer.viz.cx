"""Materialize notification rows for watched-account activity.

Called from the parser thread via op_stream for chain-tip ops (sibling to
webhooks.dispatch). Best-effort: failures are logged, never block parsing.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
from typing import Any

from helpers import watchlist
from helpers.db_client import get_db

logger = logging.getLogger(__name__)

# Curated op types → op-body fields that name an account we notify about.
# Deliberately excludes per-block reward ops (benefactor_award, receive_award,
# witness_reward, validator_reward). Uses its own field map because the global
# pubsub.ACCOUNT_FIELDS omits delegator/delegatee/validator.
CURATED_OP_FIELDS: dict[str, list[str]] = {
    "transfer": ["from", "to"],
    "award": ["receiver"],
    "delegate_vesting_shares": ["delegator", "delegatee"],
    "account_validator_vote": ["validator"],
    "account_update": ["account"],
}


def _coll():
    return get_db()[os.getenv("COLLECTION_NOTIFICATIONS", "notifications")]


def ensure_indexes() -> None:
    coll = _coll()
    coll.create_index([("owner", 1), ("read", 1)])
    coll.create_index([("owner", 1), ("created_at", -1)])
    coll.create_index([("owner", 1), ("op_id", 1)], unique=True)
    ttl = int(os.getenv("NOTIFICATION_TTL_DAYS", "90")) * 86400
    coll.create_index([("created_at", 1)], expireAfterSeconds=ttl)


def matched_accounts(op: dict[str, Any]) -> set[str]:
    op_type = op["op"][0]
    fields = CURATED_OP_FIELDS.get(op_type)
    if not fields:
        return set()
    body = op["op"][1] if len(op["op"]) > 1 else {}
    found: set[str] = set()
    for field in fields:
        value = body.get(field)
        if isinstance(value, str) and value:
            found.add(value)
        elif isinstance(value, list):
            found.update(v for v in value if isinstance(v, str))
    return found


def dispatch(op: dict[str, Any]) -> None:
    try:
        accounts = matched_accounts(op)
        if not accounts:
            return
        op_type = op["op"][0]
        body = op["op"][1] if len(op["op"]) > 1 else {}
        now = dt.datetime.now(dt.UTC)
        for account in accounts:
            for owner in watchlist.watchers_of(account):
                _insert(owner, account, op_type, op, body, now)
    except Exception:
        logger.exception("notifications.dispatch failed for op %s", op.get("_id"))


def _insert(owner, account, op_type, op, body, now) -> None:
    coll = _coll()
    doc = {
        "owner": owner,
        "account": account,
        "op_type": op_type,
        "op_id": op["_id"],
        "body": body,
        "timestamp": op.get("timestamp"),
        "read": False,
        "created_at": now,
    }
    try:
        coll.update_one(
            {"owner": owner, "op_id": op["_id"]},
            {"$setOnInsert": doc},
            upsert=True,
        )
    except Exception:
        logger.exception("notification insert failed owner=%s op_id=%s", owner, op["_id"])


def list_for(owner: str, unread_only: bool = False, limit: int = 20, before: str | None = None) -> list[dict]:
    from bson import ObjectId
    query: dict = {"owner": owner}
    if unread_only:
        query["read"] = False
    if before:
        query["_id"] = {"$lt": ObjectId(before)}
    limit = max(1, min(limit, 100))
    cursor = _coll().find(query).sort("created_at", -1).limit(limit)
    out = []
    for d in cursor:
        out.append({
            "id": str(d["_id"]),
            "account": d["account"],
            "op_type": d["op_type"],
            "body": d.get("body", {}),
            "timestamp": d.get("timestamp"),
            "read": d["read"],
        })
    return out


def unread_count(owner: str) -> int:
    return _coll().count_documents({"owner": owner, "read": False})


def mark_read(owner: str, ids: list[str] | None = None, all: bool = False) -> int:
    from bson import ObjectId
    query: dict = {"owner": owner, "read": False}
    if not all:
        query["_id"] = {"$in": [ObjectId(i) for i in (ids or [])]}
    return _coll().update_many(query, {"$set": {"read": True}}).modified_count
