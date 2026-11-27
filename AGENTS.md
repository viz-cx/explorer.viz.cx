# AGENTS.md

Notes for AI agents (and humans skimming) working in this repo.

## What lives here

This repo holds the **API server** (`api/`) and the **Next.js frontend** (`web/`). The notes below cover the API.

```
api/                 FastAPI app
  main.py            entrypoint; mounts /playground if api/static/playground/ exists
  endpoints/         route modules (one file per resource group)
  helpers/           db client, mongo, auth, viz node, pubsub, webhooks
  helpers/op_stream.py  live op-stream emit to WS subscribers + webhooks for chain-tip blocks
  parser/            block parser worker (background thread; also emits the live op stream)
  static/playground/ in-browser API playground (plain HTML/JS/CSS, no build step)
  tests/             pytest suite
web/                 Next.js frontend (see web/AGENTS.md)
config/              Kamal deploy configs (API and web)
```

## Running the API locally

From `api/`:

```zsh
.venv/bin/python -m uvicorn main:app --reload --port 8080
```

Open <http://localhost:8080/playground/>.

### Required env

`.env` in `api/` is loaded by `python-dotenv`. Needs at minimum a reachable Mongo connection and the VIZ node config.

Key env knobs:
- `SKIP_WORKERS=1` — skip startup side-effects (see section below).

### `SKIP_WORKERS=1` — what it does and when to use it

Set `SKIP_WORKERS=1` to skip three things on startup:

1. `init_node()` — VIZ node websocket handshake. Will hard-fail startup if the node is unreachable.
2. `ensure_indexes()` — Mongo index creation. Needs a live Mongo.
3. The parser background thread (the only worker; also drives the live op stream).

Use it when you only want to exercise the FastAPI surface (e.g. the playground, OpenAPI shape, route wiring). Endpoints that hit Mongo or the node will 500, but `/openapi.json`, `/docs`, `/redoc`, and `/playground/` all work.

### Common gotchas

- **Stale venv shebangs**: the `.venv/` was created when this directory was named `backend/` and was renamed to `api/`. The shebangs in `.venv/bin/uvicorn` etc. still point at the old path. Invoke via `.venv/bin/python -m uvicorn …` instead of `.venv/bin/uvicorn`, or recreate the venv.
- **VIZ public node sometimes returns 404 on the websocket handshake** — that's not a code bug, it's the node. Either point at a different node in `.env` or use `SKIP_WORKERS=1`.
- **Reload + lifespan error keeps the port held**: if startup fails under `--reload`, the reloader parent stays alive and holds 8080. Kill with `lsof -ti :8080 | xargs kill -9`.

## Tests

From `api/`:

```zsh
.venv/bin/python -m pytest
```

`pyproject.toml` sets `testpaths = ["tests"]`, `asyncio_mode = "auto"`, and adds `-ra -q`. Tests assume `SKIP_WORKERS=1` semantics — they don't need a live VIZ node.

## Tooling

- Python ≥ 3.11 (venv is currently 3.14).
- Ruff (`E F W I B UP SIM`, line length 100) and mypy are configured in `pyproject.toml`.

## Playground

`api/static/playground/` is a 3-file static app (`index.html`, `app.js`, `style.css`). It reads `/openapi.json`, groups endpoints by OpenAPI tag, builds a form per endpoint (path / query / header / JSON body with a schema-derived sample), runs the request from the browser, and renders the JSON response with a DOM-only highlighter. A separate panel connects to `/ws/ops` with optional `op_type` / `account` query filters.

The mount in `main.py` is conditional on the directory existing, so dropping the static files in production is sufficient to enable it.

## Conventions

- One endpoint module per resource group in `endpoints/` — register the router in `helpers/router.py`.
- Mongo access goes through `helpers/db_client.py` / `helpers/mongo.py`.
- Background workers are daemon threads spawned in `main._start_background_workers`. They must respect `SKIP_WORKERS=1`.
- Don't add a `Co-Authored-By: Claude` trailer to commits.
