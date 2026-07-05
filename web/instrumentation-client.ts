// Sentry init for the browser. Runs before the app hydrates. The client DSN is
// public by nature, so it uses NEXT_PUBLIC_SENTRY_DSN; without it Sentry.init
// is a no-op. WIFs are stripped from every event and breadcrumb (see
// redactWif) as a last line of defence — a private key must never be reported.
import * as Sentry from '@sentry/nextjs'
import { redactWif } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
  sendDefaultPii: false,
  beforeSend: (event) => redactWif(event),
  beforeBreadcrumb: (breadcrumb) => redactWif(breadcrumb),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
