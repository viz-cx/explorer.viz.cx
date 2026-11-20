"""In-memory pubsub bridging the sync parser thread to async WebSocket subscribers.

Multi-worker note: subscribers only receive ops that flow through the parser on
*their own* worker process. With a Redis-less deploy, this is the accepted
limitation — a single worker process runs the parser and serves ops for
its connected subscribers. A horizontal scale-out would require a broker.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from collections import deque
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

# Well-known op-body fields that name an account. Used by the WS and webhook
# filters to match an op against a subscriber's `account` filter. Lives here
# (a stdlib-only leaf module) so both consumers can import it without a cycle.
ACCOUNT_FIELDS = [
    "from",
    "to",
    "receiver",
    "account",
    "benefactor",
    "witness",
    "beneficiaries.account",
    "required_active_auths",
    "required_regular_auths",
    "required_posting_auths",
]

_Filter = Callable[[dict[str, Any]], bool]
_Entry = tuple[asyncio.AbstractEventLoop, asyncio.Queue, _Filter]

_subscribers: list[_Entry] = []
_lock = threading.Lock()

# Last ops published, so a client that just opened the feed can seed its list
# instead of waiting for the next transaction. In-memory like the rest of this
# module: empty after a restart until the chain produces new ops.
RECENT_OPS = 30
_recent: deque[dict[str, Any]] = deque(maxlen=RECENT_OPS)


def subscribe(filter_fn: _Filter, *, maxsize: int = 1000) -> tuple[asyncio.Queue, Callable[[], None]]:
    """Subscribe from an async context. Returns (queue, unsubscribe_fn)."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
    entry: _Entry = (loop, queue, filter_fn)
    with _lock:
        _subscribers.append(entry)

    def _unsubscribe() -> None:
        with _lock:
            if entry in _subscribers:
                _subscribers.remove(entry)

    return queue, _unsubscribe


def publish_op(op: dict[str, Any]) -> None:
    """Called from the parser (sync) thread. Non-blocking: drops on full queues."""
    with _lock:
        _recent.append(op)
        snapshot = list(_subscribers)
    for loop, queue, filter_fn in snapshot:
        try:
            if not filter_fn(op):
                continue
        except Exception:
            logger.exception("Subscriber filter raised; dropping op for one client")
            continue
        try:
            loop.call_soon_threadsafe(queue.put_nowait, op)
        except RuntimeError:
            pass
        except asyncio.QueueFull:
            pass


def recent_ops() -> list[dict[str, Any]]:
    """The last RECENT_OPS published ops, newest first."""
    with _lock:
        return list(reversed(_recent))


def subscriber_count() -> int:
    with _lock:
        return len(_subscribers)
