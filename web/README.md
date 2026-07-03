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

## Deployment

Deployed with [Kamal](https://kamal-deploy.org/) from the repo root:

```bash
kamal deploy -c config/deploy.web.yml
```
