"""Onboarding endpoints — account registration via invite."""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import services.onboarding as svc

router = APIRouter(
    prefix="/onboarding",
    tags=["Onboarding"],
)


class RegisterRequest(BaseModel):
    invite_secret: str
    new_account_name: str
    new_account_public_key: str


class RegisterResponse(BaseModel):
    username: str


class InviteRequest(BaseModel):
    member: str


class InviteResponse(BaseModel):
    claim_secret: str


@router.post("/invite", response_model=InviteResponse)
async def create_invite(body: InviteRequest) -> InviteResponse:
    """Create a funded invite and return the claim secret (private WIF).

    - Returns ``429 invite_limit_reached`` if the member has hit their daily cap.
    - Returns ``500 invite_creation_failed`` if broadcast fails for any reason.
    """
    if not svc.within_rate_limit(body.member):
        raise HTTPException(status_code=429, detail="invite_limit_reached")

    try:
        claim_secret = svc.create_funded_invite()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="invite_creation_failed") from exc

    return InviteResponse(claim_secret=claim_secret)


@router.post("/register", response_model=RegisterResponse)
async def register(body: RegisterRequest) -> RegisterResponse:
    """Register a new account using an invite secret.

    - Returns ``409 username_taken`` if the requested username already exists.
    - Returns ``400 invalid_invite`` if the broadcast fails for any reason
      (bad secret, expired invite, network error, etc.).
    """
    if svc.account_exists(body.new_account_name):
        raise HTTPException(status_code=409, detail="username_taken")

    initiator = os.environ.get("VIZ_SERVICE_ACCOUNT", "")
    try:
        svc.broadcast_invite_registration(
            initiator=initiator,
            new_account_name=body.new_account_name,
            invite_secret=body.invite_secret,
            new_account_key=body.new_account_public_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid_invite") from exc

    return RegisterResponse(username=body.new_account_name)
