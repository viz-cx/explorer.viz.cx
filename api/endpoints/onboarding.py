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
