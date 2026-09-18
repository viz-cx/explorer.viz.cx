"""Helper module to VIZ blockchain."""
import logging
import os
import random
from time import sleep
from typing import Any

import requests
from grapheneapi.http import Http as _GrapheneHttp
from viz import Client as VIZ

logger = logging.getLogger(__name__)


# grapheneapi's rpcexec() calls session.post() with no timeout, so a stalled
# TCP connection (e.g. the far end silently disappearing during a node
# migration) hangs the calling thread forever — no exception, no retry, no
# log line. This bit us for real: the live_stream thread hung this way across
# the 2026-07-27 martin migration and stayed silently dead for days. Inject a
# default timeout so a stall surfaces as a normal requests.Timeout, which the
# callers' existing retry loops already handle.
_RPC_TIMEOUT = (5, 15)  # (connect, read) seconds


def _patched_get_request_session(self: Any) -> requests.Session:
    # Upstream get_request_session reads a private attr that is unset when
    # Http.__init__ hasn't run; the miss falls through to Rpc.__getattr__,
    # which returns an RPC proxy function instead of raising. Go through
    # __dict__ to bypass that fallback entirely.
    session = self.__dict__.get("_request_session")
    if session is None:
        session = requests.Session()
        _orig_request = session.request

        def _request_with_timeout(method, url, **kwargs):
            kwargs.setdefault("timeout", _RPC_TIMEOUT)
            return _orig_request(method, url, **kwargs)

        session.request = _request_with_timeout
        self.__dict__["_request_session"] = session
    return session


_GrapheneHttp.get_request_session = _patched_get_request_session


def _nodes_from_env() -> list[str]:
    raw = os.getenv("VIZ_NODES", "wss://node.viz.cx/ws")
    return [n.strip() for n in raw.split(",") if n.strip()]


nodes = _nodes_from_env()

viz: Any = None


def init_node(select_first: bool = True, max_attempts: int = 5) -> None:
    """Connect to a VIZ node. Bounded retry with exponential backoff."""
    global viz
    delay = 1.0
    for attempt in range(1, max_attempts + 1):
        try:
            node = nodes[0] if select_first else random.choice(nodes)
            logger.info("Connecting to VIZ node %s (attempt %d/%d)", node, attempt, max_attempts)
            viz = VIZ(node=node)
            return
        except Exception as exc:
            logger.warning("VIZ node %s failed: %s", node, exc)
            sleep(min(delay, 30.0))
            delay *= 2
            select_first = False  # try a random node on retry
    raise RuntimeError(f"Could not connect to any VIZ node after {max_attempts} attempts")


def get_client() -> Any:
    """Return active VIZ client, connecting on first call."""
    if viz is None:
        init_node()
    return viz


_signing_client: Any = None


def get_signing_client() -> Any:
    """Return a VIZ client that can sign with the service account's active key.

    Requires ``VIZ_SERVICE_ACTIVE_KEY`` in the environment. The key is held in
    an in-RAM key store (the ``keys=`` argument), so nothing is written to the
    on-disk wallet database. The client is cached after first use."""
    global _signing_client
    if _signing_client is None:
        key = os.environ.get("VIZ_SERVICE_ACTIVE_KEY")
        if not key:
            raise RuntimeError("VIZ_SERVICE_ACTIVE_KEY is not set")
        _signing_client = VIZ(node=nodes[0], keys=[key])
    return _signing_client


def get_ops_in_block(block: int, only_virtual: bool) -> Any:
    client = get_client()
    return client.rpc.get_ops_in_block(block, 1 if only_virtual else 0)


def get_block(block: int) -> Any:
    """Return a full block, including reversible (not-yet-irreversible) ones.

    Unlike get_ops_in_block, this works for head/tip blocks but exposes only the
    real transaction operations — virtual ops (rewards) don't exist until a
    block is irreversible."""
    client = get_client()
    return client.rpc.get_block(block)


def get_dgp() -> Any:
    client = get_client()
    assert client.rpc is not None
    return client.rpc.get_dynamic_global_properties()


def get_last_block_in_chain() -> int:
    """Return number of last irreversible block from the VIZ blockchain."""
    return int(get_dgp()["last_irreversible_block_num"])


def get_head_block_num() -> int:
    """Return the current (reversible) head block number from the chain."""
    return int(get_dgp()["head_block_number"])


def convertShares(shares: str) -> float:
    return float(shares.split(" ", 1)[0])


def vesting_rate() -> float:
    """VIZ per SHARE at the current vesting rate (fund / total shares)."""
    dgp = get_dgp()
    fund = convertShares(dgp["total_vesting_fund"])
    shares = convertShares(dgp["total_vesting_shares"])
    return fund / shares if shares else 0.0


# Backwards-compat alias for the old recursive function name.
def change_node(selectFirst: bool = False) -> None:  # noqa: N802 - legacy name
    init_node(select_first=selectFirst)
