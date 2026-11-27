"""The response cache must not grow with the number of distinct URLs requested."""
from helpers import bounded_cache
from helpers.bounded_cache import BoundedInMemoryBackend


async def test_cache_size_stays_bounded(monkeypatch):
    monkeypatch.setattr(bounded_cache, "MAX_ENTRIES", 10)
    backend = BoundedInMemoryBackend()
    backend._store.clear()
    for i in range(100):
        await backend.set(f"profile:{i}", b"x", expire=60)
    assert len(backend._store) <= 10
    assert await backend.get("profile:99") == b"x"


async def test_expired_entries_are_dropped_before_live_ones(monkeypatch):
    monkeypatch.setattr(bounded_cache, "MAX_ENTRIES", 3)
    backend = BoundedInMemoryBackend()
    backend._store.clear()
    await backend.set("live", b"keep", expire=600)
    await backend.set("old1", b"x", expire=-10)
    await backend.set("old2", b"x", expire=-10)
    await backend.set("new", b"y", expire=600)
    assert set(backend._store) == {"live", "new"}
