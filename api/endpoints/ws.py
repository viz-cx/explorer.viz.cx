"""WebSocket op stream.

    GET /ws/ops?op_type=transfer&account=alice
    GET /ops/recent   — the last ops the stream emitted, to seed a fresh client

Each socket subscribes to live ops emitted by *this* worker's parser (tip
blocks only), filtered server-side. See helpers.pubsub for the multi-worker
scope caveat.
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import suppress
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from helpers import pubsub, ratelimit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Subscriptions"])

# Per-IP cap on new /ws/ops connections. The site opens one per page view and
# one per wallet broadcast, so this is an anti-flood ceiling. 0 disables.
WS_CONNECTS_PER_MIN = int(os.getenv("WS_CONNECTS_PER_MIN", "120"))


@router.get("/ops/recent")
def recent_ops() -> list[dict[str, Any]]:
    """The last ops emitted on the live stream, newest first (same shape as a
    `/ws/ops` message). Empty right after an API restart."""
    return [pubsub.serialize_op(op) for op in pubsub.recent_ops()]


@router.websocket("/ws/ops")
async def ws_ops(
    websocket: WebSocket,
    op_type: str | None = Query(default=None),
    account: str | None = Query(default=None),
) -> None:
    if not ratelimit.hit(f"ws:{ratelimit.client_ip(websocket)}", WS_CONNECTS_PER_MIN, 60.0):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    queue, unsubscribe = pubsub.subscribe(lambda op: pubsub.op_matches(op, op_type, account))
    # Sends alone never notice a closed client whose filter matches nothing, so
    # the subscription would leak; watch the receive side too.
    closed = asyncio.create_task(_until_closed(websocket))
    try:
        while True:
            next_op = asyncio.create_task(queue.get())
            await asyncio.wait({next_op, closed}, return_when=asyncio.FIRST_COMPLETED)
            if closed.done():
                next_op.cancel()
                return
            await websocket.send_json(pubsub.serialize_op(next_op.result()))
    except WebSocketDisconnect:
        pass
    finally:
        closed.cancel()
        unsubscribe()


async def _until_closed(websocket: WebSocket) -> None:
    with suppress(WebSocketDisconnect):
        while (await websocket.receive())["type"] != "websocket.disconnect":
            pass
