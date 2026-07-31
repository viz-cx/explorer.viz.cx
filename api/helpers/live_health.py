"""Liveness tracking for the live_stream background thread.

live_stream's own except-and-retry loop can't self-report a hang — if it's
stuck, it's not running the code that would log about being stuck (this is
exactly how the missing-RPC-timeout bug went unnoticed for days: the thread
just stopped beating, silently, with nothing to say so). This module is the
one thing an independent watchdog thread and the `/` healthcheck can both
read without importing the parser package.
"""
from __future__ import annotations

import time

_last_heartbeat: float | None = None


def record_heartbeat() -> None:
    global _last_heartbeat
    _last_heartbeat = time.monotonic()


def seconds_since_heartbeat() -> float | None:
    """None means live_stream hasn't completed a single poll cycle yet."""
    if _last_heartbeat is None:
        return None
    return time.monotonic() - _last_heartbeat
