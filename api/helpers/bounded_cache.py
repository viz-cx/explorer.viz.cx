"""Size-capped in-memory backend for fastapi-cache.

The stock InMemoryBackend only drops an expired entry when that same key is
read again. Cached routes are keyed by a caller-chosen path segment
(/profile/{user}, /analytics/{account}), so one request per made-up name left
an entry behind forever: unauthenticated, unbounded memory growth.
"""
from __future__ import annotations

from fastapi_cache.backends.inmemory import InMemoryBackend

MAX_ENTRIES = 2000


class BoundedInMemoryBackend(InMemoryBackend):
    async def set(self, key: str, value: bytes, expire: int | None = None) -> None:
        if len(self._store) >= MAX_ENTRIES:
            async with self._lock:
                now = self._now
                for stale in [k for k, v in self._store.items() if v.ttl_ts < now]:
                    del self._store[stale]
                if len(self._store) >= MAX_ENTRIES:
                    # shortcut: full of live entries means a flood, so drop them
                    # all rather than track recency; use an LRU if hit rate matters.
                    self._store.clear()
        await super().set(key, value, expire)
