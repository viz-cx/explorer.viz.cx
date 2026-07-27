import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from threading import Thread

import httpx
import websockets
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend

load_dotenv()

from helpers import ratelimit  # noqa: E402
from helpers.db_client import ensure_indexes  # noqa: E402
from helpers.observability import init_sentry  # noqa: E402
from helpers.richlist_snapshot import run_richlist  # noqa: E402
from helpers.router import router  # noqa: E402
from helpers.viz import init_node  # noqa: E402
from parser.live_stream import start_live_stream  # noqa: E402
from parser.parser import start_parsing  # noqa: E402

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# node.viz.cx is the legacy public VIZ RPC name. It is reverse-proxied (not
# 308-redirected) to the live node so the clean, portless URL survives end to
# end. The node moved to martin 2026-07-27 (the old vpn-amnezia box died) and is
# now served on standard :443 by martin's Caddy — so the upstream is portless
# https://rpc.viz.cx (was :19443 while the box's :443 was held by the VPN's xray).
LEGACY_RPC_HOST = "node.viz.cx"
RPC_UPSTREAM = "https://rpc.viz.cx"
RPC_WS_UPSTREAM = "wss://rpc.viz.cx"
# Per-IP cap on the public node.viz.cx HTTP proxy. Generous by design — the
# explorer's own client islands hit this from the browser, so a single active
# user makes many calls; this is an anti-abuse ceiling, not a fair-use quota.
# Tune with RPC_PROXY_RATE_PER_MIN; 0 disables the limit entirely.
RPC_PROXY_RATE_PER_MIN = int(os.getenv("RPC_PROXY_RATE_PER_MIN", "600"))
# RFC 7230 hop-by-hop headers — must not be forwarded across the proxy.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
}

# Shared async client for the node.viz.cx reverse proxy; created in lifespan.
_rpc_client: httpx.AsyncClient | None = None


def _start_background_workers() -> None:
    """Spawn the parser and richlist threads. SKIP_WORKERS=1 skips them (tests)."""
    if os.getenv("SKIP_WORKERS") == "1":
        return
    Thread(target=start_parsing, daemon=True, name="parser").start()
    if os.getenv("LIVE_STREAM_ENABLED", "1") == "1":
        Thread(target=start_live_stream, daemon=True, name="live_stream").start()
    if os.getenv("RICHLIST_ENABLED", "1") == "1":
        Thread(target=run_richlist, daemon=True, name="richlist").start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _rpc_client
    FastAPICache.init(InMemoryBackend(), prefix="fastapi-cache")
    if os.getenv("SKIP_WORKERS") != "1":
        init_node()
        ensure_indexes()
    _start_background_workers()
    _rpc_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0), follow_redirects=False)
    try:
        yield
    finally:
        await _rpc_client.aclose()
        _rpc_client = None


# Error tracking. No-op unless SENTRY_DSN is set; must run before the app is
# created so the ASGI integration wraps it.
init_sentry()

# root_path "" (FastAPI's default) when serving at the domain root; "/" makes
# Starlette 307-redirect every path (/ -> //, /playground/ -> 404). Set
# ROOT_PATH only when mounted under a stripped prefix (e.g. /api/v1).
app = FastAPI(
    title="VIZ.cx API", root_path=os.getenv("ROOT_PATH", ""), lifespan=lifespan
)
app.include_router(router)


@app.middleware("http")
async def proxy_legacy_rpc_host(request: Request, call_next):
    """Transparently reverse-proxy node.viz.cx HTTP traffic to the live node.

    Host-scoped: kamal-proxy healthchecks carry a container-address Host and
    every other vhost (api.viz.cx, the playground) fall through to call_next
    untouched. For node.viz.cx the request is forwarded to RPC_UPSTREAM and the
    upstream response returned verbatim, so the client stays on the clean
    https://node.viz.cx URL — no redirect, no :19443 leaked, and JSON-RPC POSTs
    work without redirect-following. WebSocket upgrades are handled separately
    by proxy_legacy_rpc_ws below (handshakes bypass HTTP middleware)."""
    if request.headers.get("host", "").split(":")[0] != LEGACY_RPC_HOST:
        return await call_next(request)

    if not ratelimit.hit(
        f"rpcproxy:{ratelimit.client_ip(request)}", RPC_PROXY_RATE_PER_MIN, 60.0
    ):
        return Response(status_code=429, content=b"Rate limit exceeded")

    url = RPC_UPSTREAM + request.url.path
    if request.url.query:
        url += "?" + request.url.query
    fwd_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() != "host" and k.lower() not in _HOP_BY_HOP
    }
    upstream = await _rpc_client.request(
        request.method, url, content=await request.body(), headers=fwd_headers
    )
    # Drop hop-by-hop + length/encoding headers; httpx already decoded the body,
    # so a stale Content-Length/Content-Encoding would corrupt the response.
    resp_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in _HOP_BY_HOP
        and k.lower() not in ("content-length", "content-encoding")
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
    )


@app.websocket("/{_path:path}")
async def proxy_legacy_rpc_ws(websocket: WebSocket, _path: str):
    """WebSocket JSON-RPC reverse proxy for node.viz.cx -> RPC_WS_UPSTREAM.

    Host-scoped catch-all: this app exposes no other WebSocket endpoints, so a
    single catch-all is safe; connections whose Host isn't node.viz.cx are
    rejected (1008) and never reach a real route. Both directions are pumped
    until either side closes."""
    if websocket.headers.get("host", "").split(":")[0] != LEGACY_RPC_HOST:
        await websocket.close(code=1008)
        return

    upstream_url = RPC_WS_UPSTREAM + "/" + _path
    if websocket.url.query:
        upstream_url += "?" + websocket.url.query

    await websocket.accept()
    try:
        async with websockets.connect(upstream_url, max_size=None) as upstream:

            async def client_to_upstream():
                while True:
                    msg = await websocket.receive()
                    if msg["type"] == "websocket.disconnect":
                        return
                    if (text := msg.get("text")) is not None:
                        await upstream.send(text)
                    elif (data := msg.get("bytes")) is not None:
                        await upstream.send(data)

            async def upstream_to_client():
                async for message in upstream:
                    if isinstance(message, bytes | bytearray):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)

            tasks = [
                asyncio.create_task(client_to_upstream()),
                asyncio.create_task(upstream_to_client()),
            ]
            _, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
    except Exception:
        logger.debug("node.viz.cx ws proxy closed", exc_info=True)
    finally:
        with suppress(Exception):
            await websocket.close()

_playground_dir = os.path.join(os.path.dirname(__file__), "static", "playground")
if os.path.isdir(_playground_dir):
    app.mount(
        "/playground",
        StaticFiles(directory=_playground_dir, html=True),
        name="playground",
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
