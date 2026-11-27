"""Live op stream: fan a head block's ops out to subscribers (WS, webhooks,
notifications, award stats).

Event shape: {"_id": <block + op-fraction>, "timestamp": <iso str>,
"op": [type, body]}. Called by parser.live_stream for each new head block.
"""
from __future__ import annotations

from typing import Any

from helpers import award_stats, notifications, pubsub, webhooks
from helpers.viz import convertShares

# Matches the historical sorter constant: op N of a block gets the fractional
# id `block + N / COUNT_MAX_OPS_IN_BLOCK`, keeping per-op ids ordered and unique.
COUNT_MAX_OPS_IN_BLOCK = 100_000

# Op types whose body carries a "<n> SHARES" string the sorter converted to a
# float before publishing. We mirror that here.
SHARES_OP_TYPES = {
    "benefactor_award",
    "receive_award",
    "witness_reward",
    "validator_reward",
}


def emit_block_ops(block_num: int, txs: list[dict[str, Any]]) -> None:
    """Publish each op in `txs` to pubsub and dispatch it to webhooks.

    `txs` is the saved block's transaction list: each entry has a "timestamp"
    (datetime) and an "op" ([type, body])."""
    op_number = 0.0
    for tx in txs:
        op = tx["op"]
        op_type = op[0]
        if op_type in SHARES_OP_TYPES and isinstance(op[1].get("shares"), str):
            op[1]["shares"] = convertShares(op[1]["shares"])
        op_number += 1 / COUNT_MAX_OPS_IN_BLOCK
        op_json = {
            "_id": block_num + op_number,
            "timestamp": tx["timestamp"],
            "op": op,
        }
        pubsub.publish_op(op_json)
        webhooks.dispatch(op_json)
        notifications.dispatch(op_json)
        award_stats.dispatch(op_json)
