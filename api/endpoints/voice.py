from fastapi import APIRouter, Query

from helpers import voice_ops

router = APIRouter(tags=["Voice"])


@router.get("/voice")
def voice(after: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=1000)) -> dict:
    """One-time feed for viz.cx's Voice import; remove after the import."""
    return {"items": voice_ops.page(after, limit)}
