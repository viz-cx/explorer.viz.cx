"""Optional Sentry error tracking, gated on the SENTRY_DSN env var.

When SENTRY_DSN is unset (dev, tests, or before a DSN is provisioned) init is a
no-op and nothing is sent — so this is safe to ship before a project exists.
send_default_pii stays False so request bodies and user identifiers are not
captured; the signature-auth headers and Authorization bearer tokens are
additionally redacted in _before_send as defence in depth. sentry-sdk
auto-enables its FastAPI/Starlette integration once init() runs.
"""
from __future__ import annotations

import os
from typing import Any

_SENSITIVE_HEADERS = {"authorization", "x-auth-signature", "x-auth-nonce"}


def _scrub_headers(event: dict[str, Any]) -> None:
    headers = (event.get("request") or {}).get("headers")
    if isinstance(headers, dict):
        for key in list(headers):
            if key.lower() in _SENSITIVE_HEADERS:
                headers[key] = "[filtered]"


def _before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    _scrub_headers(event)
    return event


def init_sentry() -> bool:
    """Initialise Sentry if SENTRY_DSN is set. Returns True when enabled."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return False

    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0")),
        send_default_pii=False,
        before_send=_before_send,
    )
    return True
