"""Tests for webhook registration + delivery."""
import datetime as dt
import hashlib
import hmac
import json
from unittest.mock import patch

from graphenebase.account import PrivateKey
from graphenebase.ecdsa import sign_message

from helpers import webhooks


def _make_keypair():
    priv = PrivateKey()
    return str(priv), format(priv.pubkey, "VIZ")


def _set_account(_viz, name: str, pub: str):
    _viz.rpc.get_accounts.return_value = [
        {
            "name": name,
            "regular_authority": {
                "weight_threshold": 1,
                "key_auths": [[pub, 1]],
            },
        }
    ]


def _signed_headers(client, _viz, account: str, wif: str) -> dict[str, str]:
    nonce = client.post("/auth/nonce").json()["nonce"]
    sig = sign_message(nonce.encode("utf-8"), wif).hex()
    return {
        "X-Auth-Account": account,
        "X-Auth-Nonce": nonce,
        "X-Auth-Signature": sig,
    }


def test_register_returns_id_and_secret(client, _viz):
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    headers = _signed_headers(client, _viz, "alice", wif)
    response = client.post(
        "/webhooks/",
        json={"url": "https://example.test/hook", "filter": {"op_type": "transfer"}},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "id" in body
    assert "secret" in body
    assert len(body["secret"]) > 16


def test_list_only_returns_owned_webhooks(client, _viz):
    wif_a, pub_a = _make_keypair()
    wif_b, pub_b = _make_keypair()
    _set_account(_viz, "alice", pub_a)
    client.post(
        "/webhooks/",
        json={"url": "https://example.test/a"},
        headers=_signed_headers(client, _viz, "alice", wif_a),
    )
    _set_account(_viz, "bob", pub_b)
    client.post(
        "/webhooks/",
        json={"url": "https://example.test/b"},
        headers=_signed_headers(client, _viz, "bob", wif_b),
    )

    _set_account(_viz, "alice", pub_a)
    response = client.get("/webhooks/", headers=_signed_headers(client, _viz, "alice", wif_a))
    assert response.status_code == 200
    urls = {row["url"] for row in response.json()}
    assert urls == {"https://example.test/a"}


def test_delete_requires_owner(client, _viz):
    wif_a, pub_a = _make_keypair()
    wif_b, pub_b = _make_keypair()
    _set_account(_viz, "alice", pub_a)
    created = client.post(
        "/webhooks/",
        json={"url": "https://example.test/owned"},
        headers=_signed_headers(client, _viz, "alice", wif_a),
    ).json()

    _set_account(_viz, "bob", pub_b)
    bad = client.delete(
        f"/webhooks/{created['id']}",
        headers=_signed_headers(client, _viz, "bob", wif_b),
    )
    assert bad.status_code == 404

    _set_account(_viz, "alice", pub_a)
    good = client.delete(
        f"/webhooks/{created['id']}",
        headers=_signed_headers(client, _viz, "alice", wif_a),
    )
    assert good.status_code == 200


def test_dispatch_calls_httpx_with_signed_body(client, _viz):
    """Register a webhook, then dispatch a matching op and verify httpx.post
    receives the body with the correct HMAC signature."""
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    created = client.post(
        "/webhooks/",
        json={"url": "https://example.test/hook", "filter": {"op_type": "transfer"}},
        headers=_signed_headers(client, _viz, "alice", wif),
    ).json()
    secret = created["secret"]

    op = {
        "_id": 1.5,
        "timestamp": dt.datetime(2026, 1, 1, 10, 0, 0, tzinfo=dt.UTC),
        "op": ["transfer", {"from": "bob", "to": "alice", "amount": 1.0}],
    }
    with (
        patch("helpers.webhooks.httpx.post") as mock_post,
        patch("helpers.webhooks._is_public", return_value=True),
    ):
        mock_post.return_value.status_code = 200
        webhooks.dispatch(op)
        webhooks._executor_singleton().shutdown(wait=True)

    assert mock_post.called, "httpx.post should have been called"
    call_kwargs = mock_post.call_args.kwargs
    body_bytes = call_kwargs["content"]
    digest = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    assert call_kwargs["headers"]["X-Viz-Signature"] == f"sha256={digest}"
    payload = json.loads(body_bytes)
    assert payload["op_type"] == "transfer"
    assert payload["body"]["from"] == "bob"

    webhooks._executor = None


def test_dispatch_skips_non_matching_op(client, _viz):
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    client.post(
        "/webhooks/",
        json={"url": "https://example.test/hook", "filter": {"op_type": "transfer"}},
        headers=_signed_headers(client, _viz, "alice", wif),
    )

    op = {"_id": 2.5, "timestamp": dt.datetime.now(dt.UTC), "op": ["vote", {"voter": "x"}]}
    with patch("helpers.webhooks.httpx.post") as mock_post:
        webhooks.dispatch(op)
        webhooks._executor_singleton().shutdown(wait=True)
    assert not mock_post.called

    webhooks._executor = None


def test_deliver_refuses_internal_hosts():
    """A webhook must not be usable to reach localhost, private or
    link-local addresses from inside the deploy network."""
    for url in (
        "http://127.0.0.1:27017/",
        "http://localhost/",
        "http://10.0.0.5/hook",
        "http://169.254.169.254/latest",
        "http://[::1]/",
        "http://no-such-host.invalid/",
    ):
        assert not webhooks._is_public(url), url
        with patch("helpers.webhooks.httpx.post") as mock_post:
            webhooks._deliver(url, "secret", {})
        assert not mock_post.called, url
    assert webhooks._is_public("http://8.8.8.8/hook")


def test_register_caps_webhooks_per_account(client, _viz):
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    for i in range(webhooks.MAX_PER_ACCOUNT):
        webhooks.register("alice", f"https://example.test/{i}", None, None)
    response = client.post(
        "/webhooks/",
        json={"url": "https://example.test/one-too-many"},
        headers=_signed_headers(client, _viz, "alice", wif),
    )
    assert response.status_code == 409


def test_dispatch_drops_when_backlog_full(client, monkeypatch):
    import threading

    webhooks.register("alice", "https://example.test/hook", None, None)
    full = threading.BoundedSemaphore(1)
    full.acquire()
    monkeypatch.setattr(webhooks, "_backlog", full)
    with patch("helpers.webhooks._deliver") as deliver:
        webhooks.dispatch({"_id": 1.0, "timestamp": None, "op": ["transfer", {}]})
    assert not deliver.called


def test_malformed_webhook_id_is_422_not_500(client, _viz):
    wif, pub = _make_keypair()
    _set_account(_viz, "alice", pub)
    response = client.delete(
        "/webhooks/not-an-object-id", headers=_signed_headers(client, _viz, "alice", wif)
    )
    assert response.status_code == 422


def _deliver_with_statuses(statuses):
    with (
        patch("helpers.webhooks.httpx.post") as mock_post,
        patch("helpers.webhooks._is_public", return_value=True),
        patch("helpers.webhooks.time.sleep") as mock_sleep,
    ):
        mock_post.side_effect = [type("R", (), {"status_code": s})() for s in statuses]
        webhooks._deliver("https://example.test/hook", "secret", {"a": 1})
    return mock_post.call_count, [c.args[0] for c in mock_sleep.call_args_list]


def test_deliver_retries_5xx_with_backoff_then_gives_up():
    assert _deliver_with_statuses([500, 502, 503]) == (3, [1, 2])


def test_deliver_stops_on_first_non_5xx():
    assert _deliver_with_statuses([500, 204]) == (2, [1])
    # A 4xx is the receiver's answer, not an outage: no retry.
    assert _deliver_with_statuses([404]) == (1, [])


def test_deliver_retries_when_the_request_raises():
    with (
        patch("helpers.webhooks.httpx.post", side_effect=OSError("refused")) as mock_post,
        patch("helpers.webhooks._is_public", return_value=True),
        patch("helpers.webhooks.time.sleep"),
    ):
        webhooks._deliver("https://example.test/hook", "secret", {})
    assert mock_post.call_count == webhooks.MAX_ATTEMPTS
