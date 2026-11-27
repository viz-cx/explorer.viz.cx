"""Webhook registry and signed delivery.

Storage (`coll_webhooks`):
    _id: ObjectId
    account: str          owner (signed-request authenticated)
    url: str              POST target
    filter: dict          {op_type?, account?}
    secret: str           HMAC-SHA256 key (returned once on creation)
    created_at: datetime
    active: bool

Delivery from the parser thread is fire-and-forget on a ThreadPoolExecutor.
Each POST is signed with header `X-Viz-Signature: sha256=<hex>` over the body.
Retries: 3 attempts, exponential backoff (1s, 2s, 4s). On exhaustion the call
is logged and dropped; the webhook stays active for future ops.

The active-webhooks list is cached in-memory so dispatch() doesn't hit Mongo
per op. The cache is invalidated explicitly on register/deactivate (covers
the single-worker deployment that pubsub.py already documents) and refreshed
on a TTL fallback for multi-worker setups where register may land in a
different process than the parser.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import secrets
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import urlsplit

import httpx
from bson import ObjectId

from helpers import pubsub
from helpers.db_client import get_db

logger = logging.getLogger(__name__)

SIGNATURE_HEADER = "X-Viz-Signature"
USER_AGENT = "viz.cx-webhook/1"
DELIVERY_TIMEOUT = 10.0
MAX_ATTEMPTS = 3
MAX_PER_ACCOUNT = 10
# Deliveries waiting or running. Past this, new ones are dropped: one hanging
# receiver (33s per op on 4 workers) must not grow the queue without bound.
MAX_BACKLOG = 1000
_backlog = threading.BoundedSemaphore(MAX_BACKLOG)

_executor: ThreadPoolExecutor | None = None

_cache_lock = threading.Lock()
_cache: list[dict[str, Any]] | None = None
_cache_expires_at: float = 0.0


def _cache_ttl() -> float:
    return float(os.getenv("WEBHOOK_CACHE_TTL", "5.0"))


def _invalidate_cache() -> None:
    global _cache, _cache_expires_at
    with _cache_lock:
        _cache = None
        _cache_expires_at = 0.0


def _active_webhooks() -> list[dict[str, Any]]:
    global _cache, _cache_expires_at
    now = time.monotonic()
    with _cache_lock:
        if _cache is not None and now < _cache_expires_at:
            return _cache
    try:
        fresh = list(_coll().find({"active": True}))
    except Exception:
        logger.exception("Webhook registry read failed")
        return []
    with _cache_lock:
        _cache = fresh
        _cache_expires_at = time.monotonic() + _cache_ttl()
    return fresh


def _coll():
    name = os.getenv("COLLECTION_WEBHOOKS", "webhooks")
    return get_db()[name]


def ensure_indexes() -> None:
    coll = _coll()
    coll.create_index([("account", 1)])
    coll.create_index([("active", 1), ("filter.op_type", 1)])


def _executor_singleton() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        max_workers = int(os.getenv("WEBHOOK_WORKERS", "4"))
        _executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="webhook"
        )
    return _executor


def register(account: str, url: str, op_type: str | None, target_account: str | None) -> dict[str, str]:
    if _coll().count_documents({"account": account}) >= MAX_PER_ACCOUNT:
        raise ValueError(f"Webhook limit reached ({MAX_PER_ACCOUNT} per account)")
    secret = secrets.token_urlsafe(32)
    doc = {
        "account": account,
        "url": url,
        "filter": {"op_type": op_type, "account": target_account},
        "secret": secret,
        "created_at": dt.datetime.now(dt.UTC),
        "active": True,
    }
    result = _coll().insert_one(doc)
    _invalidate_cache()
    return {"id": str(result.inserted_id), "secret": secret}


def deactivate(webhook_id: str, account: str) -> bool:
    result = _coll().delete_one({"_id": ObjectId(webhook_id), "account": account})
    if result.deleted_count == 1:
        _invalidate_cache()
        return True
    return False


def list_for(account: str) -> list[dict[str, Any]]:
    cursor = _coll().find({"account": account}, {"secret": 0})
    out = []
    for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        out.append(doc)
    return out


def _sign(secret: str, payload: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _is_public(url: str) -> bool:
    """True only if every address the host resolves to is a public one, so a
    webhook can't be aimed at mongo, localhost or other containers."""
    # shortcut: checked just before the POST, not pinned to it, so a host that
    # re-resolves between the two (DNS rebinding) slips through; pin the
    # resolved IP in the request if webhooks ever reach sensitive networks.
    try:
        infos = socket.getaddrinfo(urlsplit(url).hostname, None)
    except (OSError, UnicodeError):
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def _deliver(url: str, secret: str, payload: dict[str, Any]) -> None:
    if not _is_public(url):
        logger.warning("Webhook skipped, host is not a public address: url=%s", url)
        return
    body = json.dumps(payload, default=str).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        SIGNATURE_HEADER: _sign(secret, body),
    }
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = httpx.post(url, content=body, headers=headers, timeout=DELIVERY_TIMEOUT)
            if response.status_code < 500:
                return
        except Exception as exc:
            logger.info("Webhook delivery failed (attempt %d): %s", attempt + 1, exc)
        if attempt < MAX_ATTEMPTS - 1:
            time.sleep(2 ** attempt)
    logger.warning("Webhook delivery exhausted: url=%s", url)


def dispatch(op: dict[str, Any]) -> None:
    """Match the op against active webhooks and queue HTTP deliveries.
    Called from the parser thread (via op_stream emit); never blocks. The
    active-webhooks list is served from an in-memory cache to avoid a Mongo
    round trip per op."""
    candidates = _active_webhooks()
    if not candidates:
        return
    payload = pubsub.serialize_op(op)
    pool = _executor_singleton()
    for wh in candidates:
        filt = wh.get("filter") or {}
        if not pubsub.op_matches(op, filt.get("op_type"), filt.get("account")):
            continue
        if not _backlog.acquire(blocking=False):
            logger.warning("Webhook backlog full; dropping delivery: url=%s", wh["url"])
            continue
        pool.submit(_deliver, wh["url"], wh["secret"], payload).add_done_callback(
            lambda _f: _backlog.release()
        )
