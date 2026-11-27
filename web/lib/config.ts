/**
 * Base endpoints for the two data tiers.
 *
 *  - REST (`api.viz.cx`) → Server Components.
 *  - VIZ JSON-RPC node (node.viz.cx) → client islands via @viz-cx/core.
 *  - WS op stream → the live home feed.
 *
 * All overridable via env so dev can point at a local API / node.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "https://api.viz.cx";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "wss://api.viz.cx/ws/ops";

/** Primary node first, fallbacks after — used by the client-side round-robin. */
export const NODE_ENDPOINTS = (
  process.env.NEXT_PUBLIC_NODE_ENDPOINTS ??
  "https://node.viz.cx,https://api.viz.world"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * The one unrecoverable archive gap (snapshot-restore hole). Block detail pages
 * in this inclusive range show an honest "operations unavailable" notice instead
 * of an error. See memory: viz-node-situation.
 */
export const HISTORY_HOLE = { from: 79_105_831, to: 80_679_604 } as const;

export function isInHistoryHole(blockNum: number): boolean {
  return blockNum >= HISTORY_HOLE.from && blockNum <= HISTORY_HOLE.to;
}
