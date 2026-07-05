"""Tests for bearer-token sessions."""
from graphenebase.account import PrivateKey
from graphenebase.ecdsa import sign_message

from helpers import sessions


def _make_keypair():
    priv = PrivateKey()
    return str(priv), format(priv.pubkey, "VIZ")


def _set_account(_viz, name: str, pub: str):
    _viz.rpc.get_accounts.return_value = [
        {"name": name, "regular_authority": {"weight_threshold": 1, "key_auths": [[pub, 1]]}}
    ]


def _signed_headers(client, account: str, wif: str) -> dict[str, str]:
    nonce = client.post("/auth/nonce").json()["nonce"]
    sig = sign_message(nonce.encode("utf-8"), wif).hex()
    return {"X-Auth-Account": account, "X-Auth-Nonce": nonce, "X-Auth-Signature": sig}


def test_create_and_resolve_roundtrip():
    token = sessions.create_session("alice")
    assert isinstance(token, str) and len(token) > 16
    assert sessions.resolve_session(token) == "alice"


def test_resolve_unknown_token_is_none():
    assert sessions.resolve_session("nope") is None


def test_post_session_issues_token(client, _viz):
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    resp = client.post("/session", headers=_signed_headers(client, "alice", wif))
    assert resp.status_code == 200, resp.text
    assert sessions.resolve_session(resp.json()["token"]) == "alice"


def test_post_session_rejects_bad_signature(client, _viz):
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    nonce = client.post("/auth/nonce").json()["nonce"]
    resp = client.post(
        "/session",
        headers={"X-Auth-Account": "alice", "X-Auth-Nonce": nonce, "X-Auth-Signature": "00" * 65},
    )
    assert resp.status_code == 401


def test_revoke_session_removes_token():
    token = sessions.create_session("alice")
    assert sessions.revoke_session(token) is True
    assert sessions.resolve_session(token) is None


def test_revoke_session_is_idempotent():
    assert sessions.revoke_session("never-existed") is False


def test_delete_session_endpoint_revokes(client):
    token = sessions.create_session("alice")
    resp = client.delete("/session", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}
    assert sessions.resolve_session(token) is None
    # Second logout with the same (now-gone) token still succeeds, ok=False.
    resp2 = client.delete("/session", headers={"Authorization": f"Bearer {token}"})
    assert resp2.status_code == 200
    assert resp2.json() == {"ok": False}


def test_delete_session_requires_bearer(client):
    assert client.delete("/session").status_code == 401
