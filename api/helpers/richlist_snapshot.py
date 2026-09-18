"""Richlist snapshot worker.

VIZ has no native richlist RPC, so we enumerate every account via
`lookup_accounts`, fetch balances in bulk with `get_accounts`, compute
liquid / capital / effective figures per account, and store a sorted top-N
snapshot in Mongo. A daemon thread refreshes it on an interval; the
`GET /richlist` endpoint just serves the latest snapshot.
"""
import datetime as dt
import logging
import os
import time
from typing import Any

from helpers.db_client import get_db
from helpers.viz import convertShares, get_client, vesting_rate

logger = logging.getLogger(__name__)

REFRESH_SECONDS = int(os.getenv("RICHLIST_REFRESH_SECONDS", "600"))
TOP_N = int(os.getenv("RICHLIST_SIZE", "200"))
COLLECTION = os.getenv("RICHLIST_COLLECTION", "richlist")
SNAPSHOT_ID = "snapshot"
_LOOKUP_LIMIT = 1000  # graphene caps lookup_accounts / get_accounts at 1000


def _all_account_names(client: Any) -> list[str]:
    """Paginate lookup_accounts over the whole account set (sorted, inclusive
    of the lower bound — so each page after the first repeats one name)."""
    names: list[str] = []
    lower = ""
    while True:
        batch = client.rpc.lookup_accounts(lower, _LOOKUP_LIMIT)
        if not batch:
            break
        if names and batch and batch[0] == names[-1]:
            batch = batch[1:]
        if not batch:
            break
        names.extend(batch)
        if len(batch) < _LOOKUP_LIMIT - 1:
            break
        lower = names[-1]
    return names


def _chunks(seq: list[str], size: int):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def _row(acc: dict[str, Any], rate: float) -> dict[str, Any]:
    liquid = convertShares(acc["balance"])
    own = convertShares(acc["vesting_shares"])
    delegated = convertShares(acc["delegated_vesting_shares"])
    received = convertShares(acc["received_vesting_shares"])
    effective = own - delegated + received
    capital_viz = own * rate
    effective_viz = effective * rate
    return {
        "name": acc["name"],
        "liquid": round(liquid, 3),
        "own_shares": round(own, 6),
        "effective_shares": round(effective, 6),
        "capital_viz": round(capital_viz, 3),
        "effective_viz": round(effective_viz, 3),
        # "wallet" = total holdings (liquid + own capital at current rate).
        "wallet": round(liquid + capital_viz, 3),
    }


def refresh_once() -> int:
    """Rebuild the snapshot. Returns the number of accounts scanned."""
    client = get_client()
    rate = vesting_rate()
    names = _all_account_names(client)

    rows: list[dict[str, Any]] = []
    for chunk in _chunks(names, _LOOKUP_LIMIT):
        for acc in client.rpc.get_accounts(chunk):
            if acc:
                rows.append(_row(acc, rate))

    rows.sort(key=lambda r: r["wallet"], reverse=True)
    top = rows[:TOP_N]

    get_db()[COLLECTION].replace_one(
        {"_id": SNAPSHOT_ID},
        {
            "_id": SNAPSHOT_ID,
            "updated_at": dt.datetime.now(dt.UTC),
            "vesting_rate": rate,
            "total_accounts": len(names),
            "count": len(top),
            "accounts": top,
        },
        upsert=True,
    )
    logger.info("richlist refreshed: %d accounts scanned, top %d stored", len(names), len(top))
    return len(names)


def run_richlist() -> None:
    """Daemon loop: refresh, then sleep REFRESH_SECONDS. Survives node hiccups."""
    while True:
        try:
            refresh_once()
        except Exception:
            logger.exception("richlist refresh failed; will retry next cycle")
        time.sleep(REFRESH_SECONDS)
