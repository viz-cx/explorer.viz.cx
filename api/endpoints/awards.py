from fastapi import APIRouter, Query

from helpers import award_stats

router = APIRouter(tags=["Awards"])


@router.get("/awards")
def awards(
    receiver: str = Query(pattern=r"^[a-z0-9.-]{2,25}$"),
    memo: str = Query(max_length=200),
) -> dict:
    return award_stats.totals(receiver, memo)
