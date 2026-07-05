// Sentry init for the Node.js server runtime. Loaded from instrumentation.ts.
// No DSN → Sentry.init is a no-op and nothing is sent, so this is safe to ship
// before a Sentry project exists.
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
