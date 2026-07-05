"""FastAPI dependency resolving a bearer token to an account name."""
from __future__ import annotations

from fastapi import Header, HTTPException, status

from helpers import sessions


def bearer_token(authorization: str = Header(default="")) -> str:
    """Extract the raw bearer token from the Authorization header.

    Does not check the token against storage — useful for revocation, where
    deletion is idempotent and validating first would be pointless.
    """
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return token


def require_session(authorization: str = Header(default="")) -> str:
    token = bearer_token(authorization)
    account = sessions.resolve_session(token)
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return account
