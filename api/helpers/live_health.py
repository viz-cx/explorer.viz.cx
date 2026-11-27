"""Liveness tracking for the background worker threads.

A worker's own except-and-retry loop can't self-report a hang — if it's
stuck, it's not running the code that would log about being stuck (this is
exactly how the missing-RPC-timeout bug went unnoticed for days: the thread
just stopped beating, silently, with nothing to say so). This module is the
one thing an independent watchdog thread and the `/` healthcheck can both
read without importing the parser package.
"""
from __future__ import annotations

import time

_last_heartbeat: dict[str, float] = {}


def record_heartbeat(worker: str = "live_stream") -> None:
    _last_heartbeat[worker] = time.monotonic()


def seconds_since_heartbeat(worker: str = "live_stream") -> float | None:
    """None means the worker hasn't completed a single cycle yet."""
    last = _last_heartbeat.get(worker)
    return None if last is None else time.monotonic() - last
