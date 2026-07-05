"""Dual Mongo clients: sync pymongo for the parser worker (and its webhook
delivery) and async motor for FastAPI handlers.

Both clients point at the same MongoDB server; pymongo and motor each maintain
their own connection pool. Index creation is done once on the sync client
(indexes are server-side, not per-client).

Tests pass a single mongomock-motor `AsyncMongoMockClient` whose internal sync
mongomock client backs the sync side — so both views share one in-memory store.
"""
import os
from typing import Any

import pymongo
from motor.motor_asyncio import AsyncIOMotorClient

_client: Any = None
_db: Any = None
_async_client: Any = None
_async_db: Any = None
_indexes_ensured = False


def set_client(client: Any, db_name: str | None = None) -> None:
    """Override the active sync client (used in tests). Also clears any
    in-memory caches keyed off the previous client (e.g. the webhook registry
    cache) so tests don't bleed state across each other."""
    global _client, _db, _indexes_ensured
    _client = client
    _db = client[db_name or os.getenv("DB_NAME", "")]
    _indexes_ensured = False

    from helpers import watchlist, webhooks
    webhooks._invalidate_cache()
    watchlist._invalidate()


def set_async_client(client: Any, db_name: str | None = None) -> None:
    """Override the active async client (used in tests)."""
    global _async_client, _async_db
    _async_client = client
    _async_db = client[db_name or os.getenv("DB_NAME", "")]


def get_db() -> Any:
    global _client, _db
    if _db is None:
        _client = pymongo.MongoClient(os.getenv("MONGO", ""))
        _db = _client[os.getenv("DB_NAME", "")]
    return _db


def get_async_db() -> Any:
    global _async_client, _async_db
    if _async_db is None:
        _async_client = AsyncIOMotorClient(os.getenv("MONGO", ""))
        _async_db = _async_client[os.getenv("DB_NAME", "")]
    return _async_db


def ensure_indexes() -> None:
    """Create indexes on first call. Idempotent."""
    global _indexes_ensured
    if _indexes_ensured:
        return
    db = get_db()
    coll = db[os.getenv("COLLECTION", "")]
    coll.create_index([("_id", 1), ("block.op.0", 1), ("block.op.1.id", 1)])

    from helpers import signature_auth, webhooks
    from helpers.key_index import ensure_key_indexes

    signature_auth.ensure_nonce_indexes()
    webhooks.ensure_indexes()
    ensure_key_indexes()
    _indexes_ensured = True
