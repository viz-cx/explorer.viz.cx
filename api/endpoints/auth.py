import os

from fastapi import APIRouter, Depends

from helpers.ratelimit import rate_limit
from helpers.signature_auth import issue_nonce

# Per-IP cap on nonce/session minting. A normal wallet connect costs one
# /auth/nonce + one /session, so 30/min is generous for real users while still
# stopping a flood. Override with AUTH_RATE_PER_MIN (0 disables).
AUTH_RATE_PER_MIN = int(os.getenv("AUTH_RATE_PER_MIN", "30"))

router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
    responses={401: {"description": "Authentication failed"}},
)


@router.post("/nonce", dependencies=[Depends(rate_limit("nonce", AUTH_RATE_PER_MIN))])
def get_nonce() -> dict[str, str]:
    """Issue a single-use nonce. Client signs this with their WIF and sends
    the signature in X-Auth-Signature alongside X-Auth-Account and
    X-Auth-Nonce on authenticated requests. Nonce expires in 5 minutes."""
    return {"nonce": issue_nonce()}
