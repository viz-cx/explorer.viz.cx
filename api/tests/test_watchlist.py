"""Tests for watchlist storage + endpoints."""
from graphenebase.account import PrivateKey
from graphenebase.ecdsa import sign_message

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
