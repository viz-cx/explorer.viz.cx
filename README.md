# [VIZ.cx](https://viz.cx/)

A one-stop UI for the [VIZ blockchain](https://github.com/VIZ-Blockchain/viz-cpp-node?tab=readme-ov-file#introducing-viz) — explorer, dashboard, wallet, and governance hub, backed by owned infrastructure. Live at [viz.cx](https://viz.cx/).

It consolidates capabilities previously scattered across several ecosystem sites into a single, dark-themed interface.

## Features

- **Explorer** — accounts, blocks, transactions, validators, and rich list.
- **Dashboard & wallet** — connect by key, view balances / energy / capital, and sign every core operation (award, transfer, power up/down, delegation, validator vote, invite onboarding).
- **Governance** — committee proposals (propose / vote / cancel) and validator management (register / update / idle / chain properties / vote proxy).

## Frontend (`web/`)

[Next.js 16](https://nextjs.org) (App Router) with React 19, TypeScript, and Tailwind CSS 4. It talks to the VIZ blockchain client-side through [`@viz-cx/core`](https://www.npmjs.com/package/@viz-cx/core), a TypeScript SDK built on [viz-js-lib](https://github.com/VIZ-Blockchain/viz-js-lib). See [`web/README.md`](web/README.md).

## API (`api/`)

Built on [FastAPI](https://github.com/tiangolo/fastapi) with MongoDB, using [viz-python-lib](https://github.com/VIZ-Blockchain/viz-python-lib) to read the chain server-side. It proxies the VIZ RPC node (adding CORS and caching), serves indexed data (rich list, blocks, and an account → public-key index), and streams a realtime op feed over WebSocket. It also ships an in-browser API playground at `/playground/` — see [`api/README.md`](api/README.md).

## Deployment

Both services deploy with [Kamal](https://kamal-deploy.org/) from the repo root:

```zsh
kamal deploy -c config/deploy.yml       # API      (viz-cx-api)
kamal deploy -c config/deploy.web.yml   # frontend (viz-cx-web)
```

## Community

Join our telegram group [t.me/viz_cx](https://t.me/viz_cx)
