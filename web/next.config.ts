import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy is now set per-request in proxy.ts, which injects a
// fresh nonce so we can enforce it (Report-Only + 'unsafe-inline' scripts is
// gone). It can't live here because next.config headers() are static and a
// nonce must vary per request.
//
// Enforced on every response, including static assets. These are safe to turn
// on unconditionally — unlike CSP they don't risk breaking a rendered page.
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Standalone output → self-contained server.js for the Kamal node-app image
  // (same pattern as seahava / massageinalanya). The Dockerfile copies
  // .next/standalone and runs `node server.js`.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // network.viz.cx was the canonical host 2026-08 → 2026-09 and stays as an
  // alias for a grace window — permanently redirect it to explorer.viz.cx
  // (path + query preserved). Host-scoped so the proxy healthcheck (container
  // address as Host) is never redirected. permanent:true => 308.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "network.viz.cx" }],
        destination: "https://explorer.viz.cx/:path*",
        permanent: true,
      },
    ];
  },
};

// Wrap with Sentry. Source-map upload only happens when SENTRY_AUTH_TOKEN is
// present, so local/CI builds without it stay clean; silent avoids build noise.
// The runtime SDK still no-ops without a DSN (see the sentry.*.config files).
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
});

