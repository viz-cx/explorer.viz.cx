import os

from fastapi import APIRouter, Depends

from helpers import sessions
from helpers.ratelimit import rate_limit
from helpers.session_auth import bearer_token
from helpers.signature_auth import require_signed_request

# Shares the wallet-connect budget with /auth/nonce (see auth.py).
AUTH_RATE_PER_MIN = int(os.getenv("AUTH_RATE_PER_MIN", "30"))

router = APIRouter(tags=["Auth"], responses={401: {"description": "Authentication failed"}})


@router.post(
    "/session",
    dependencies=[Depends(rate_limit("session", AUTH_RATE_PER_MIN))],
)
def create_session(account: str = Depends(require_signed_request)) -> dict[str, str]:
    """Exchange a valid signature challenge for a bearer token (TTL 30d)."""
    return {"token": sessions.create_session(account)}


@router.delete("/session")
def revoke_session(token: str = Depends(bearer_token)) -> dict[str, bool]:
    """Revoke the presented bearer token (logout). Idempotent — a token that is
    already gone still returns 200 so double-logout is not an error."""
    return {"ok": sessions.revoke_session(token)}
