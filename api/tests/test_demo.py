"""Tests for demo endpoints."""

import os


def test_demo_session(client, monkeypatch):
    """Test demo session returns credentials when env vars are set."""
    monkeypatch.setenv("VIZ_DEMO_ACCOUNT", "kudos-demo")
    monkeypatch.setenv("VIZ_DEMO_REGULAR_KEY", "5KdemoRegularWIF")
    r = client.post("/demo/session")
    assert r.status_code == 200
    assert r.json() == {
        "username": "kudos-demo",
        "regular_key_wif": "5KdemoRegularWIF",
    }


def test_demo_session_missing_env_returns_500(client):
    """Test demo session returns 500 when env vars are unset."""
    # Ensure env vars are unset
    for k in ("VIZ_DEMO_ACCOUNT", "VIZ_DEMO_REGULAR_KEY"):
        os.environ.pop(k, None)
    r = client.post("/demo/session")
    assert r.status_code == 500
