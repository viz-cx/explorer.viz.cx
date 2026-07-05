"""Lightweight in-process fixed-window rate limiter.

The API runs as a single uvicorn worker (see the Dockerfile CMD — no
``--workers``), so an in-memory counter is authoritative for the whole service.
If the deployment ever scales to multiple workers/processes, swap the backing
store for Redis; the public surface (``hit`` / ``rate_limit`` / ``client_ip``)
can stay the same.

Fixed-window semantics: each key gets ``limit`` hits per ``window_s`` seconds;
the window resets the first time a hit lands after it has elapsed. A
non-positive ``limit`` disables the check (used to make proxy limiting
opt-out via env).
"""
from __future__ import annotations

import threading
import time

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
# key -> (window_start_monotonic, count)
_windows: dict[str, tuple[float, int]] = {}

# Opportunistic garbage-collection so idle IPs don't accumulate forever (a slow
# memory leak / DoS otherwise). Swept every _SWEEP_EVERY hits under the lock.
_SWEEP_EVERY = 10_000
_STALE_AFTER = 3600.0
_ops_since_sweep = 0


def _sweep_locked(now: float) -> None:
    global _ops_since_sweep
    _ops_since_sweep += 1
    if _ops_since_sweep < _SWEEP_EVERY:
        return
    _ops_since_sweep = 0
    stale = [k for k, (start, _) in _windows.items() if now - start >= _STALE_AFTER]
    for k in stale:
        del _windows[k]


def hit(key: str, limit: int, window_s: float) -> bool:
    """Record one hit for ``key``. Return True if still within ``limit`` for the
    current window, False once the limit is exceeded."""
    if limit <= 0:
        return True
    now = time.monotonic()
    with _lock:
        start, count = _windows.get(key, (now, 0))
        if now - start >= window_s:
            start, count = now, 0
        count += 1
        _windows[key] = (start, count)
        _sweep_locked(now)
        return count <= limit


def client_ip(request: Request) -> str:
    """Best-effort client IP. uvicorn runs with ``--proxy-headers
    --forwarded-allow-ips '*'``, so ``request.client.host`` is the real client
    address forwarded by kamal-proxy, not the proxy's own."""
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, limit: int, window_s: float = 60.0):
    """FastAPI dependency: allow ``limit`` requests per ``window_s`` per IP for
    this ``bucket``; raise 429 past that."""

    def _dep(request: Request) -> None:
        if not hit(f"{bucket}:{client_ip(request)}", limit, window_s):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please slow down.",
            )

    return _dep


def reset() -> None:
    """Clear all windows. For tests."""
    global _ops_since_sweep
    with _lock:
        _windows.clear()
        _ops_since_sweep = 0
