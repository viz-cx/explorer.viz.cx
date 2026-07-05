from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from helpers import notifications
from helpers.session_auth import require_session

router = APIRouter(prefix="/notifications", tags=["Notifications"], responses={401: {"description": "Authentication failed"}})


class ReadBody(BaseModel):
    ids: list[str] | None = None
    all: bool = False


@router.get("")
def list_notifications(
    owner: str = Depends(require_session),
    unread: bool = Query(default=False),
    limit: int = Query(default=20),
    before: str | None = Query(default=None),
) -> dict:
    return {"notifications": notifications.list_for(owner, unread_only=unread, limit=limit, before=before)}


@router.get("/count")
def count(owner: str = Depends(require_session)) -> dict[str, int]:
    return {"unread": notifications.unread_count(owner)}


@router.post("/read")
def read(body: ReadBody, owner: str = Depends(require_session)) -> dict[str, int]:
    return {"updated": notifications.mark_read(owner, ids=body.ids, all=body.all)}
