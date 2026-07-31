"""Real-time op stream from the chain head.

The DB parser (parser.parser) indexes *irreversible* blocks — complete with
virtual ops, but ~12 blocks (~36s) behind the head, since virtual ops only
exist once a block is final. For the live WS/webhook feed we want the actual
transactions users submit the instant they land in a block, so this poller
reads the head block via get_block and emits its real ops.

Virtual ops (validator_reward and the like) are intentionally absent here — they
don't exist on a reversible block — which also keeps the feed free of the
per-block reward noise that otherwise dominates a quiet chain.
"""
from __future__ import annotations

import logging
import os
from time import sleep
from typing import Any, NoReturn

from helpers.live_health import record_heartbeat, seconds_since_heartbeat
from helpers.op_stream import emit_block_ops
from helpers.viz import get_block, get_head_block_num

logger = logging.getLogger(__name__)

# VIZ produces a block every 3s; polling a little faster keeps tail latency low
# without meaningfully more load.
POLL_INTERVAL = float(os.getenv("LIVE_POLL_INTERVAL", "1.5"))
# Cap how far we replay after a stall so a long pause can't dump a backlog of
# "live" ops onto subscribers all at once.
MAX_CATCHUP = int(os.getenv("LIVE_MAX_CATCHUP", "20"))
# How often the watchdog checks, and how stale a heartbeat must get before it
# alerts. Generous relative to the ~20s worst-case RPC timeout (see helpers/viz
# _RPC_TIMEOUT) plus the 5s retry sleep, so one bad cycle doesn't page anyone.
WATCHDOG_CHECK_INTERVAL = float(os.getenv("LIVE_STREAM_WATCHDOG_INTERVAL", "30"))
WATCHDOG_STALE_AFTER = float(os.getenv("LIVE_STREAM_STALE_SEC", "90"))


def flatten_block(block: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten get_block's nested transactions into op_stream's tx shape:
    ``[{"timestamp": <iso str>, "op": [type, body]}, ...]``.

    Reversible blocks expose no per-op timestamp, so the block-level timestamp is
    applied to every op."""
    ts = block.get("timestamp")
    return [
        {"timestamp": ts, "op": op}
        for trx in block.get("transactions", [])
        for op in trx.get("operations", [])
    ]


def start_live_stream() -> NoReturn:
    """Poll the chain head and emit each new block's real ops to subscribers."""
    last_emitted: int | None = None
    while True:
        try:
            head = get_head_block_num()
            record_heartbeat()
            if last_emitted is None:
                # Start at the current head; never replay history on boot.
                last_emitted = head - 1
            # Bound catch-up so a stall doesn't flood the feed.
            start = max(last_emitted + 1, head - MAX_CATCHUP + 1)
            for block_num in range(start, head + 1):
                block = get_block(block_num)
                if block:
                    txs = flatten_block(block)
                    if txs:
                        emit_block_ops(block_num, txs)
                last_emitted = block_num
            sleep(POLL_INTERVAL)
        except Exception as e:  # noqa: BLE001 - keep the poller alive on any error
            logger.warning("Live stream error: %s. Retry in 5s.", e)
            sleep(5)


def start_live_stream_watchdog() -> NoReturn:
    """Alert once when the live_stream heartbeat goes stale, and once more
    when it recovers. Edge-triggered so a genuine hang pages someone without
    spamming on every check while it stays down."""
    was_stale = False
    while True:
        sleep(WATCHDOG_CHECK_INTERVAL)
        age = seconds_since_heartbeat()
        if age is None:
            continue  # live_stream hasn't completed its first poll yet
        is_stale = age > WATCHDOG_STALE_AFTER
        if is_stale and not was_stale:
            logger.error(
                "live_stream heartbeat stale: last beat %.0fs ago (threshold %.0fs)",
                age, WATCHDOG_STALE_AFTER,
            )
            try:
                import sentry_sdk
                sentry_sdk.capture_message(
                    f"live_stream heartbeat stale ({age:.0f}s) — notifications/live feed likely dead",
                    level="error",
                )
            except Exception:
                logger.exception("Failed to report stale live_stream heartbeat to Sentry")
        elif was_stale and not is_stale:
            logger.warning("live_stream heartbeat recovered after being stale")
        was_stale = is_stale
