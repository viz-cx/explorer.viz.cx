"""Helper module for working with MongoDB — raw block I/O only."""

import contextlib
import datetime as dt
import os

import pymongo
from pymongo.errors import DuplicateKeyError

from helpers.db_client import get_async_db, get_db


def _db():
    return get_db()


def _adb():
    return get_async_db()


class _CollProxy:
    """Lazy attribute proxy. Resolves to the underlying collection on access.
    `db_getter` controls whether this is a sync (pymongo) or async (motor)
    collection — same proxy shape, two storage backends."""

    def __init__(self, name_env: str, default: str = "", db_getter=_db):
        self._name_env = name_env
        self._default = default
        self._db_getter = db_getter

    def _resolve(self):
        return self._db_getter()[os.getenv(self._name_env, self._default)]

    def __getattr__(self, item):
        return getattr(self._resolve(), item)

    def __getitem__(self, key):
        base_name = os.getenv(self._name_env, self._default)
        return self._db_getter()[f"{base_name}.{key}"]


coll = _CollProxy("COLLECTION")
acoll = _CollProxy("COLLECTION", db_getter=_adb)


def save_block(block, blocknum: int | None = None) -> None:
    """Save block to MongoDB collection.

    `blocknum` is the authoritative block number from the caller. It MUST be
    supplied for empty blocks — a block with no ops carries no number to derive
    from, and the chain produces such blocks routinely. When omitted (legacy
    callers) the number is taken from the first op."""
    if blocknum is None:
        blocknum = block[0]["block"]
    for tx in block:
        tx.pop("block", None)
        if tx.get("trx_id") == "0000000000000000000000000000000000000000":
            tx.pop("trx_id")
        tx_t = dt.datetime.fromisoformat(tx.get("timestamp"))
        tx.update({"timestamp": tx_t})
    # Idempotent insert: a DuplicateKeyError means this block is already stored,
    # so suppress it and let the caller advance instead of crash-looping. A
    # desync between the parser's in-memory position and the DB (an error after a
    # successful insert but before progress was recorded) previously froze the
    # tip at 81,288,426 for ~16h on repeated re-inserts of the same _id.
    with contextlib.suppress(DuplicateKeyError):
        coll.insert_one({"block": block, "_id": blocknum})


def get_block(id: int) -> dict:
    """Return block by id from collection in MongoDB database."""
    result = coll.find({"_id": id}).limit(1)
    return tuple(result)[0]


async def aget_block(id: int) -> dict:
    return await acoll.find_one({"_id": id})


def get_last_block() -> dict:
    """Return last block from collection in MongoDB database."""
    result = coll.find({}).sort("_id", pymongo.DESCENDING).limit(1)
    return tuple(result)[0]


async def aget_last_block() -> dict:
    rows = await acoll.find({}).sort("_id", pymongo.DESCENDING).limit(1).to_list(length=1)
    return rows[0]


def get_last_blocknum() -> int:
    """Return number of last block from collection in MongoDB database."""
    result = get_last_block()
    return int(result["_id"])
