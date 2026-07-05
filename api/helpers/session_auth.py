"""FastAPI dependency resolving a bearer token to an account name."""
from __future__ import annotations

from fastapi import Header, HTTPException, status

from helpers import sessions


def require_session(authorization: str = Header(default="")) -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    account = sessions.resolve_session(token)
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return account
