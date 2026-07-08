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

No build step — it's plain HTML/CSS/JS. The mount is conditional on the directory existing, so it's safe in production behind nginx.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VIZ_NODES` | No | Comma-separated list of VIZ node URLs (default: `wss://node.viz.cx/ws`) |
| `DB_NAME` | No | MongoDB database name (default: `viztest` in tests) |
| `COLLECTION` | No | MongoDB collection name (default: `blocks`) |
| `VIZ_SERVICE_ACCOUNT` | Yes (production) | VIZ network account name used as the `initiator` for onboarding registrations |
| `VIZ_SERVICE_ACTIVE_KEY` | Yes (production) | WIF-encoded active key for `VIZ_SERVICE_ACCOUNT`, used to sign invite registration transactions |

### Onboarding endpoints

`POST /onboarding/register` requires `VIZ_SERVICE_ACCOUNT` and `VIZ_SERVICE_ACTIVE_KEY` to be set in production. The service account must hold a valid invite balance on the VIZ network before any registration can succeed.

> **Note:** `broadcast_invite_registration` in `services/onboarding.py` is currently a stub (`NotImplementedError`) because `vizbase.operations` does not include an `Invite_registration` operation class. All tests monkeypatch this function. A real implementation requires either a custom binary serializer or an updated `viz-python-lib` that includes the operation class.
