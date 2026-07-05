import { NextResponse, type NextRequest } from "next/server";

// Per-request Content-Security-Policy with a fresh nonce. A nonce lets us drop
// 'unsafe-inline' from script-src — the meaningful XSS lever — while still
// allowing Next's own inline bootstrap scripts to run. Next.js reads the nonce
// from the Content-Security-Policy header we set on the *request* below and
// stamps it onto every framework/page <script> it emits during SSR.
//
// Because the nonce only exists at request time, every page must be
// dynamically rendered (see `export const dynamic = "force-dynamic"` in
// app/layout.tsx); statically prerendered HTML would carry no nonce and its
// inline scripts would be blocked.
//
// style-src deliberately keeps 'unsafe-inline': a nonce on style-src does NOT
// cover React's inline style={{}} attributes (CSP treats those as
// style-src-attr), and styles are a far weaker attack surface than scripts.
function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // 'strict-dynamic' propagates trust to scripts loaded by our nonced
    // bootstrap; 'self' remains a fallback for browsers without strict-dynamic.
    // 'unsafe-eval' is dev-only — React uses eval() for the hydration error
    // overlay; production never needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.viz.cx wss://api.viz.cx https://node.viz.cx https://api.viz.world",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Forward the nonce to the renderer via both the request CSP header (which
  // Next parses) and x-nonce (readable from Server Components if ever needed).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on document requests only. Skip API routes, Next's static/image assets
  // (governed by the page CSP), the SEO static files, and next/link prefetches
  // (no nonce needed — they don't execute inline scripts).
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
