"""node.viz.cx host-scoped reverse proxy (middleware + ws route in main.py).

The legacy public VIZ RPC name is transparently proxied to the live node
(https://rpc.viz.cx) with method, path and query preserved, so clients
stay on the clean portless URL — no 308. Every other Host —
including the container-address Host that kamal-proxy healthchecks send — is
untouched.
"""
from unittest.mock import AsyncMock

import httpx
import pytest
from starlette.websockets import WebSocketDisconnect

import main


def test_node_viz_cx_post_is_reverse_proxied(client, monkeypatch):
    fake = AsyncMock(spec=httpx.AsyncClient)
    fake.request.return_value = httpx.Response(
        200,
        content=b'{"head_block_number":123}',
        headers={"content-type": "application/json"},
    )
    monkeypatch.setattr(main, "_rpc_client", fake)

    response = client.post(
        "/some/path?foo=bar",
        headers={"Host": "node.viz.cx"},
        content=b'{"id":1}',
        follow_redirects=False,
    )

    # client got the upstream body back on the same URL — not a redirect
    assert response.status_code == 200
    assert response.json()["head_block_number"] == 123
    assert "location" not in response.headers

    # forwarded to the live node with method, path and query preserved
    args, kwargs = fake.request.call_args
    assert args[0] == "POST"
    assert args[1] == "https://rpc.viz.cx/some/path?foo=bar"
    assert kwargs["content"] == b'{"id":1}'


def test_node_viz_cx_with_port_is_proxied(client, monkeypatch):
    fake = AsyncMock(spec=httpx.AsyncClient)
    fake.request.return_value = httpx.Response(200, content=b"ok")
    monkeypatch.setattr(main, "_rpc_client", fake)

    response = client.get(
        "/", headers={"Host": "node.viz.cx:443"}, follow_redirects=False
    )

    assert response.status_code == 200
    assert fake.request.call_args.args[1] == "https://rpc.viz.cx/"


def test_stale_length_and_encoding_headers_are_dropped(client, monkeypatch):
    # httpx decodes the body; forwarding upstream's Content-Length/Encoding
    # would corrupt the response. Starlette must recompute them.
    import gzip

    fake = AsyncMock(spec=httpx.AsyncClient)
    fake.request.return_value = httpx.Response(
        200,
        content=gzip.compress(b"decoded-body"),
        headers={"content-encoding": "gzip"},
    )
    monkeypatch.setattr(main, "_rpc_client", fake)

    response = client.get("/", headers={"Host": "node.viz.cx"})

    assert response.content == b"decoded-body"
    assert "content-encoding" not in response.headers
    assert response.headers["content-length"] == str(len(b"decoded-body"))


def test_other_hosts_unaffected(client):
    response = client.get("/", headers={"Host": "api.viz.cx"})
    assert response.status_code == 200


def test_ws_rejects_non_node_host(client):
    # The catch-all ws route must reject any Host that isn't node.viz.cx so it
    # never shadows real vhosts. TestClient's default Host is "testserver".
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/"):
        pass
