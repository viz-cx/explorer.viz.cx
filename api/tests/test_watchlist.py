"""Tests for watchlist storage + endpoints."""
from graphenebase.account import PrivateKey

from helpers import sessions, watchlist


def _make_keypair():
    priv = PrivateKey()
    return str(priv), format(priv.pubkey, "VIZ")


def _bearer(account: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {sessions.create_session(account)}"}


def test_add_is_idempotent():
    watchlist.ensure_indexes()
    watchlist.add("alice", "bob")
    watchlist.add("alice", "bob")
    assert watchlist.list_for("alice") == ["bob"]


def test_remove():
    watchlist.ensure_indexes()
    watchlist.add("alice", "bob")
    assert watchlist.remove("alice", "bob") is True
    assert watchlist.remove("alice", "bob") is False
    assert watchlist.list_for("alice") == []


def test_watchers_of():
    watchlist.ensure_indexes()
    watchlist.add("alice", "bob")
    watchlist.add("carol", "bob")
    assert set(watchlist.watchers_of("bob")) == {"alice", "carol"}


def test_endpoints_are_owner_scoped(client, _viz):
    a = _bearer("alice")
    b = _bearer("bob")
    assert client.post("/watchlist", json={"account": "target"}, headers=a).status_code == 200
    assert client.get("/watchlist", headers=a).json()["accounts"] == ["target"]
    assert client.get("/watchlist", headers=b).json()["accounts"] == []


def test_endpoint_requires_bearer(client, _viz):
    assert client.get("/watchlist").status_code == 401


def test_watchlist_rejects_non_account_names_and_caps_size(client, monkeypatch):
    from helpers import sessions, watchlist

    headers = {"Authorization": f"Bearer {sessions.create_session('alice')}"}
    bad = client.post("/watchlist", json={"account": "Not An Account!"}, headers=headers)
    assert bad.status_code == 422

    monkeypatch.setattr(watchlist, "MAX_PER_OWNER", 2)
    for name in ("bob", "carol"):
        assert client.post("/watchlist", json={"account": name}, headers=headers).status_code == 200
    assert client.post("/watchlist", json={"account": "dave"}, headers=headers).status_code == 409
    # Re-adding one already watched stays idempotent at the cap.
    assert client.post("/watchlist", json={"account": "bob"}, headers=headers).status_code == 200
