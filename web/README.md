# VIZ.cx — web frontend

The [viz.cx](https://viz.cx/) frontend: [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript, and Tailwind CSS 4. It interacts with the VIZ blockchain client-side via [`@viz-cx/core`](https://www.npmjs.com/package/@viz-cx/core) and reads indexed data from the API in [`../api`](../api).

> **Heads up:** this project pins a Next.js version with breaking changes versus what you may be used to. Read [`AGENTS.md`](./AGENTS.md) before making changes.

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Lockfiles:** local development uses **pnpm** (`pnpm-lock.yaml`), but the Docker image builds with `npm ci` (`package-lock.json`). Keep both in sync when changing dependencies.

## Checks

Lint is intentionally not the gate here. Before committing, run the real checks:

```bash
pnpm exec tsc --noEmit   # types
pnpm test                # vitest
pnpm build               # next build
```

## Environment

All optional — the app runs with sensible defaults (see `lib/config.ts`).

| Var | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | build | REST API base (default `https://api.viz.cx`) |
| `NEXT_PUBLIC_WS_URL` | build | Live op-stream WS (default `wss://api.viz.cx/ws/ops`) |
| `NEXT_PUBLIC_NODE_ENDPOINTS` | build | Comma-separated RPC nodes |
| `NEXT_PUBLIC_SENTRY_DSN` | build | Browser error tracking; **unset = Sentry disabled** |
| `SENTRY_DSN` | runtime | Server/edge error tracking; unset = disabled |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | build/runtime | Sentry environment tag (default `production`) |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | build/runtime | Tracing sample rate (default `0`) |
| `SENTRY_AUTH_TOKEN` | build | Enables source-map upload during `next build`; omit to skip |

> `NEXT_PUBLIC_*` values are inlined at **build time** (Turbopack), so they must
> be present when the image is built, not just at runtime. Sentry is fully
> no-op until a DSN is provided, so it's safe to ship without one. Private keys
> (WIF) are stripped from every Sentry event/breadcrumb by `lib/sentry-scrub.ts`.

## Deployment

Deployed with [Kamal](https://kamal-deploy.org/) from the repo root:

```bash
kamal deploy -c config/deploy.web.yml
```
