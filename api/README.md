# VIZ.cx/api

VIZ.cx API server, built on FastAPI

## Getting Started

1. Install dependencies

```zsh
pip install -r requirements.txt
```

2. Start FastAPI

```zsh
uvicorn main:app --reload --port 8080
```

3. Open local API docs: [http://localhost:8080/docs](http://localhost:8080/docs) or [http://localhost:8080/redoc](http://localhost:8080/redoc)

## Playground

A self-contained API playground is served from `static/playground/` and mounted at [http://localhost:8080/playground/](http://localhost:8080/playground/). It reads `/openapi.json`, lists every endpoint grouped by tag, builds a form for path/query/body params, and runs the request in the browser. The live op feed panel connects to `/ws/ops` with optional `op_type` / `account` filters.

No build step — it's plain HTML/CSS/JS. The mount is conditional on the directory existing, so dropping the static files is enough to enable or disable it.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VIZ_NODES` | No | Comma-separated list of VIZ node URLs (default: `wss://node.viz.cx/ws`) |
| `DB_NAME` | No | MongoDB database name (default: `viztest` in tests) |
| `COLLECTION` | No | MongoDB collection name (default: `blocks`) |
