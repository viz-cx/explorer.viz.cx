"""Per-user watchlists + a cached account→owners index for dispatch.

The active index is cached in-memory (TTL + invalidate-on-write) so the
parser's per-op dispatch never hits Mongo, mirroring helpers.webhooks.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict

from helpers.db_client import get_db

_cache_lock = threading.Lock()
_cache: dict[str, list[str]] | None = None
_cache_expires_at: float = 0.0


def _cache_ttl() -> float:
    return float(os.getenv("WATCHLIST_CACHE_TTL", "5.0"))


def _coll():
    return get_db()[os.getenv("COLLECTION_WATCHLISTS", "watchlists")]


def ensure_indexes() -> None:
    _coll().create_index([("owner", 1), ("account", 1)], unique=True)
    _coll().create_index([("account", 1)])


def _invalidate() -> None:
    global _cache, _cache_expires_at
    with _cache_lock:
        _cache = None
        _cache_expires_at = 0.0


def add(owner: str, account: str) -> None:
    _coll().update_one(
        {"owner": owner, "account": account},
        {"$setOnInsert": {"owner": owner, "account": account}},
        upsert=True,
    )
    _invalidate()


def remove(owner: str, account: str) -> bool:
    deleted = _coll().delete_one({"owner": owner, "account": account}).deleted_count == 1
    if deleted:
        _invalidate()
    return deleted


def list_for(owner: str) -> list[str]:
    return sorted(d["account"] for d in _coll().find({"owner": owner}, {"account": 1}))


def active_index() -> dict[str, list[str]]:
    global _cache, _cache_expires_at
    now = time.monotonic()
    with _cache_lock:
        if _cache is not None and now < _cache_expires_at:
            return _cache
    index: dict[str, list[str]] = defaultdict(list)
    try:
        for d in _coll().find({}, {"owner": 1, "account": 1}):
            index[d["account"]].append(d["owner"])
    except Exception:
        return {}
    plain = dict(index)
    with _cache_lock:
        _cache = plain
        _cache_expires_at = time.monotonic() + _cache_ttl()
    return plain


def watchers_of(account: str) -> list[str]:
    return active_index().get(account, [])
