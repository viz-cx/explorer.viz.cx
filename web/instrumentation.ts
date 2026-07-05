// Next.js instrumentation hook. register() runs once per server runtime at
// startup and loads the matching Sentry config; onRequestError forwards
// server-side render/route errors to Sentry (no-op without a DSN).
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
