"""account_keys collection: maps account name → current signing public keys.

Used by the /key-references endpoint to answer "which accounts hold this key?"
without relying on the account_by_key node plugin.

Schema:  { _id: account_name, keys: [pub_key_string, ...] }
Index:   { keys: 1 }  (multikey — one entry per key, O(1) lookup by pub key)
"""

from helpers.db_client import get_async_db, get_db

COLLECTION = "account_keys"


def _coll():
    return get_db()[COLLECTION]


def _acoll():
    return get_async_db()[COLLECTION]


def ensure_key_indexes() -> None:
    _coll().create_index([("keys", 1)])


def _keys_from_authority(auth: dict | None) -> list[str]:
    if not auth or not isinstance(auth, dict):
        return []
    return [ka[0] for ka in auth.get("key_auths", []) if ka]


def keys_from_account_data(acc: dict) -> list[str]:
    """Extract all signing public keys from a raw get_accounts entry.

    Uses master_authority / active_authority / regular_authority (the field
    names returned by the node's get_accounts RPC). Memo key is excluded —
    it cannot sign transactions.
    """
    seen: dict[str, None] = {}
    for authority in ("master_authority", "active_authority", "regular_authority"):
        for k in _keys_from_authority(acc.get(authority)):
            seen[k] = None
    return list(seen)


def upsert_keys(account_name: str, keys: list[str]) -> None:
    """Sync upsert — called from the parser thread."""
    _coll().update_one(
        {"_id": account_name},
        {"$set": {"keys": keys}},
        upsert=True,
    )


async def async_find_accounts_by_key(pub: str) -> list[str]:
    """Return all account names that currently list `pub` as a signing key."""
    cursor = _acoll().find({"keys": pub}, {"_id": 1})
    return [doc["_id"] async for doc in cursor]
