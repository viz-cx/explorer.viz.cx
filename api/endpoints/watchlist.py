from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from helpers import watchlist
from helpers.session_auth import require_session

router = APIRouter(prefix="/watchlist", tags=["Watchlist"], responses={401: {"description": "Authentication failed"}})


class WatchBody(BaseModel):
    account: str


@router.get("")
def list_watchlist(owner: str = Depends(require_session)) -> dict[str, list[str]]:
    return {"accounts": watchlist.list_for(owner)}


@router.post("")
def add_watch(body: WatchBody, owner: str = Depends(require_session)) -> dict[str, bool]:
    watchlist.add(owner, body.account)
    return {"ok": True}


@router.delete("/{account}")
def remove_watch(account: str, owner: str = Depends(require_session)) -> dict[str, bool]:
    if not watchlist.remove(owner, account):
        raise HTTPException(status_code=404, detail="Not watching this account")
    return {"ok": True}
