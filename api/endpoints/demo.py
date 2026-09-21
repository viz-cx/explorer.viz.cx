"""Demo endpoints — reviewer access to demo account credentials."""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/demo", tags=["Demo"])


class DemoSessionResponse(BaseModel):
    username: str
    regular_key_wif: str


@router.post("/session")
def demo_session() -> DemoSessionResponse:
    """Return demo account credentials for App Store reviewers.

    Reads VIZ_DEMO_ACCOUNT and VIZ_DEMO_REGULAR_KEY environment variables.
    Returns 500 if either variable is unset.
    """
    username = os.environ.get("VIZ_DEMO_ACCOUNT")
    regular_key_wif = os.environ.get("VIZ_DEMO_REGULAR_KEY")
    if not username or not regular_key_wif:
        raise HTTPException(
            status_code=500,
            detail="Demo account not configured. Set VIZ_DEMO_ACCOUNT and VIZ_DEMO_REGULAR_KEY.",
        )
    return DemoSessionResponse(username=username, regular_key_wif=regular_key_wif)
