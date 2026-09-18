"""VIZ Blockchain to MongoDB parser.

Indexes *irreversible* blocks (complete with virtual ops) into MongoDB. The
real-time WS/webhook feed is served separately from the chain head by
parser.live_stream — see that module for why the two are split.
"""

import os
from time import sleep
from typing import NoReturn

from helpers import award_stats
from helpers.mongo import get_last_blocknum, save_block
from helpers.viz import get_client, get_last_block_in_chain, get_ops_in_block

_ACCOUNT_OPS = {"account_create", "account_update", "invite_registration"}


def _update_key_index(block: list) -> None:
    """Re-fetch and upsert key index for any account ops in this block."""
    names = set()
    for tx in block:
        op = tx.get("op") or []
        if not op or op[0] not in _ACCOUNT_OPS:
            continue
        op_type, op_data = op[0], op[1]
        if op_type in ("account_create", "invite_registration"):
            names.add(op_data.get("new_account_name", ""))
        elif op_type == "account_update":
            names.add(op_data.get("account", ""))
    names.discard("")
    if not names:
        return
    try:
        from helpers.key_index import keys_from_account_data, upsert_keys
        accounts = get_client().rpc.get_accounts(list(names))
        for acc in accounts:
            if acc:
                upsert_keys(acc["name"], keys_from_account_data(acc))
    except Exception as exc:
        print(f"[key_index] update failed: {exc}")


def resolve_start_block(last_db_block: int) -> int:
    """Floor the parser position at PARSER_START_BLOCK - 1.

    Used to jump over a known hole in history that no reachable node can
    serve (blocks 79,105,831–80,463,600 as of 2026-06-10). Never rewinds
    below blocks already in the database."""
    start = int(os.getenv("PARSER_START_BLOCK", "0"))
    return max(last_db_block, start - 1)


def start_parsing() -> NoReturn:
    """Parse VIZ Blockchain blocks to MongoDB (irreversible blocks only)."""
    try:
        last_db_block = get_last_blocknum()
        print(f"Last block in db: {last_db_block}")
    except IndexError:
        print("Blocks not found in current MongoDB collection. Start from 1.")
        last_db_block = 0
    last_db_block = resolve_start_block(last_db_block)
    while True:
        try:
            last_chain_block = get_last_block_in_chain()
            if last_chain_block - last_db_block > 0:
                for _ in range(last_db_block + 1, last_chain_block + 1):
                    # `_` is the authoritative block number. The node returns an
                    # empty list for blocks with no ops (common) and for blocks
                    # outside its short get_ops_in_block window; either way we
                    # store an empty block and advance rather than crash, so the
                    # parser can never re-stick on the same block.
                    block = get_ops_in_block(_, False)
                    save_block(block, _)
                    # Record progress the instant the block is persisted, BEFORE
                    # any best-effort side work. Otherwise a failure in
                    # _update_key_index leaves the block saved but the position
                    # unadvanced, and the next iteration re-inserts → dup-key
                    # crash-loop (froze the tip at 81,288,426 for ~16h).
                    last_db_block = _
                    _update_key_index(block)
                    award_stats.capture_payouts(block, _)
                    if last_db_block % 100 == 0:
                        print(f"Saved block {_} (ch: {last_chain_block})")
            else:
                sleep(3)
        except Exception as e:
            print(f"Parsing error: {str(e)}. Restart in 10 seconds.")
            sleep(10)
            print("Restarting...")
