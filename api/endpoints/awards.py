from fastapi import APIRouter, Query

from helpers import award_stats

router = APIRouter(tags=["Awards"])


@router.get("/awards")
def awards(
    receiver: str = Query(pattern=r"^[a-z0-9.-]{2,25}$"),
    memo: str = Query(max_length=200),
) -> dict:
    t = award_stats.totals(receiver, memo)
    return {"count": t["count"], "initiators": t["initiators"], "total_viz": None}
