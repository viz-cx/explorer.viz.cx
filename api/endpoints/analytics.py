import datetime as dt

from fastapi import APIRouter
from fastapi_cache.decorator import cache

from helpers.analytics import OP_CAP, aggregate_history
from helpers.viz import get_client

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    responses={404: {"description": "Not found"}},
)

_PAGE = 1000
_WINDOW_DAYS = 90


def _collect_history(account: str, now: dt.datetime) -> list:
    """Walk get_account_history backwards from the tip, bounded by OP_CAP and
    the 90-day cutoff. Returns entries newest-first is NOT required — the reducer
    is order-independent."""
    cutoff = (now - dt.timedelta(days=_WINDOW_DAYS)).isoformat()
    rpc = get_client().rpc
    collected: list = []
    frm = -1
    while len(collected) < OP_CAP:
        limit = _PAGE if frm < 0 else min(_PAGE, frm + 1)
        if limit <= 0:
            break
        batch = rpc.get_account_history(account, frm, limit)
        if not batch:
            break
        collected.extend(batch)
        oldest_seq = batch[0][0]
        oldest_ts = batch[0][1].get("timestamp", "")
        if oldest_ts and oldest_ts < cutoff:
            break
        if oldest_seq <= 0:
            break
        frm = oldest_seq - 1
    # Trim anything older than the cutoff and cap length.
    trimmed = [e for e in collected if e[1].get("timestamp", "") >= cutoff]
    return trimmed[:OP_CAP]


@router.get("/{account}")
@cache(expire=60)
async def analytics(account: str) -> dict:
    now = dt.datetime.utcnow()
    try:
        entries = _collect_history(account, now)
    except Exception:
        return {"account": account, "available": False,
                "range": None, "rewards": None, "activity": None}
    agg = aggregate_history(entries, account, now)
    return {"account": account, "available": True, **agg}
