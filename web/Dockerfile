# Multi-stage Next.js build (output: 'standalone' in next.config.ts).
# Build context = web/ (kamal chdirs to the git clone root; config/deploy.web.yml
# sets builder.context: web).

FROM node:24-alpine AS deps
WORKDIR /app
# pnpm, same major as CI (.github/workflows/web.yml) — pnpm-lock.yaml is the
# only lockfile; pnpm-workspace.yaml carries the overrides and build allow-list.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@10 && pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
