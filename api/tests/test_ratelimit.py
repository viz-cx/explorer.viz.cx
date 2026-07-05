"""Tests for the in-process fixed-window rate limiter."""
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from helpers import ratelimit


def test_hit_allows_up_to_limit_then_blocks():
    key = "k"
    assert all(ratelimit.hit(key, 3, 60.0) for _ in range(3))
    assert ratelimit.hit(key, 3, 60.0) is False
    assert ratelimit.hit(key, 3, 60.0) is False


def test_nonpositive_limit_disables_check():
    assert all(ratelimit.hit("off", 0, 60.0) for _ in range(1000))
    assert all(ratelimit.hit("off", -1, 60.0) for _ in range(1000))


def test_distinct_keys_are_independent():
    assert ratelimit.hit("a", 1, 60.0) is True
    assert ratelimit.hit("a", 1, 60.0) is False
    # A different key has its own budget.
    assert ratelimit.hit("b", 1, 60.0) is True


def test_window_reset_after_elapse(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: now["t"])
    assert ratelimit.hit("w", 2, 10.0) is True
    assert ratelimit.hit("w", 2, 10.0) is True
    assert ratelimit.hit("w", 2, 10.0) is False
    now["t"] += 11.0  # window elapsed
    assert ratelimit.hit("w", 2, 10.0) is True


def test_rate_limit_dependency_returns_429():
    app = FastAPI()

    @app.get("/ping", dependencies=[Depends(ratelimit.rate_limit("ping", 2))])
    def ping() -> dict[str, bool]:
        return {"ok": True}

    c = TestClient(app)
    assert c.get("/ping").status_code == 200
    assert c.get("/ping").status_code == 200
    assert c.get("/ping").status_code == 429
