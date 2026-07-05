// Sentry init for the Edge runtime (middleware, edge routes). Loaded from
// instrumentation.ts. No DSN → no-op, same as the server config.
import * as Sentry from '@sentry/nextjs'
import { redactWif } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  sendDefaultPii: false,
  beforeSend: (event) => redactWif(event),
  beforeBreadcrumb: (breadcrumb) => redactWif(breadcrumb),
})
