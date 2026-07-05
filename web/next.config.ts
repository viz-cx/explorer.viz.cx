import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Content-Security-Policy. Shipped Report-Only first (see headers() below): the
// browser reports violations without blocking, so we can watch for breakage
// before flipping to an enforcing `Content-Security-Policy` header.
//
// connect-src lists the two data tiers (api.viz.cx REST + ws feed, node.viz.cx
// JSON-RPC, api.viz.world RPC fallback). Fonts are self-hosted by next/font at
// build time, so font-src 'self' is sufficient. script-src still needs
// 'unsafe-inline' for Next's hydration bootstrap — move to per-request nonces
// before switching this policy from Report-Only to enforcing.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://api.viz.cx wss://api.viz.cx https://node.viz.cx https://api.viz.world",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Enforced on every response. These are safe to turn on immediately — unlike
// CSP they don't risk breaking a rendered page.
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
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  // Standalone output → self-contained server.js for the Kamal node-app image
  // (same pattern as seahava / massageinalanya). The Dockerfile copies
  // .next/standalone and runs `node server.js`.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // www is only a mirror — permanently redirect it to the bare apex (path +
  // query preserved). Host-scoped to www so the proxy healthcheck (non-www
  // Host) is never redirected. permanent:true => 308.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.viz.cx" }],
        destination: "https://viz.cx/:path*",
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

