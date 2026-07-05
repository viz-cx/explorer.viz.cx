from fastapi import APIRouter, Depends

from helpers import sessions
from helpers.signature_auth import require_signed_request

router = APIRouter(tags=["Auth"], responses={401: {"description": "Authentication failed"}})


@router.post("/session")
def create_session(account: str = Depends(require_signed_request)) -> dict[str, str]:
    """Exchange a valid signature challenge for a bearer token (TTL 30d)."""
    return {"token": sessions.create_session(account)}
