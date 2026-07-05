"""Opaque bearer-token sessions for the read/light-write path.

A session is minted once after a signature-challenge (POST /session) and then
presented as `Authorization: Bearer <token>` on notification/watchlist calls,
so the polling bell never re-signs or hits the node RPC per request.
"""
from __future__ import annotations

import datetime as dt
import os
import secrets

from helpers.db_client import get_db

SESSION_TTL = dt.timedelta(days=30)


def _coll():
    return get_db()[os.getenv("COLLECTION_SESSIONS", "sessions")]


def ensure_indexes() -> None:
    _coll().create_index(
        [("created_at", 1)], expireAfterSeconds=int(SESSION_TTL.total_seconds())
    )


def create_session(account: str) -> str:
    token = secrets.token_urlsafe(32)
    _coll().insert_one(
        {"_id": token, "account": account, "created_at": dt.datetime.now(dt.UTC)}
    )
    return token


def resolve_session(token: str) -> str | None:
    if not token:
        return None
    doc = _coll().find_one({"_id": token})
    return doc["account"] if doc else None
