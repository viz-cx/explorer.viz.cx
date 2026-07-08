"""People search endpoint — prefix-match on VIZ account usernames."""
from typing import Optional

from fastapi import APIRouter

from helpers.viz import get_client

router = APIRouter(
    prefix="/people",
    tags=["People"],
)

_SEARCH_LIMIT = 25


def search_usernames(q: str, limit: int = _SEARCH_LIMIT) -> list[str]:
    """Return up to *limit* usernames that start with *q*.

    Uses the VIZ ``lookup_accounts`` RPC call which returns usernames in
    lexicographic order starting from *lower_bound*.
    """
    client = get_client()
    results: list[str] = client.rpc.lookup_accounts(q, limit)
    # lookup_accounts may return names that no longer start with q when the
    # query is very broad; filter to keep only genuine prefix matches.
    return [name for name in results if name.startswith(q)][:limit]


@router.get("")
async def search_people(q: str = "") -> dict:
    """Search for people by username prefix.

    - `q` shorter than 2 characters returns an empty list immediately.
    - Results are capped at 25.
    """
    if len(q) < 2:
        return {"people": []}

    usernames = search_usernames(q, limit=_SEARCH_LIMIT)
    people = [{"username": name, "display_name": None} for name in usernames]
    return {"people": people}
