/**
 * On-chain confirmation for broadcast transactions.
 *
 * `network_broadcast_api.broadcast_transaction` (the async variant we're forced
 * to use — see makeBroadcastTransport in lib/actions.ts) resolves as soon as the
 * node's RPC layer *accepts the call*. It does not report whether the tx passed
 * validation, so a rejected tx (bad signature, insufficient funds, …) looked
 * like a success to the caller.
 *
 * We close that gap by watching the same live op stream the home feed consumes
 * (`wss://api.viz.cx/ws/ops`, already allow-listed in the CSP) for the op we
 * just sent. Match → confirmed, with the block it landed in. Silence → we say
 * so instead of claiming success.
 */
import { createApiClient } from "@viz-cx/api";
import { WS_URL } from "./config";

/** How long to wait for our op to show up on the live stream. Blocks are 3s and
 * the stream polls the head every 1.5s, so a healthy tx lands well inside this. */
export const CONFIRM_TIMEOUT_MS = 20_000;

/** How long to wait for the confirmation socket itself. If it never opens we
 * can't confirm anything, and we let the broadcast through unverified rather
 * than failing a tx that most likely succeeded. */
export const SOCKET_OPEN_TIMEOUT_MS = 5_000;

export type ConfirmOutcome =
  | { status: "confirmed"; blockNum: number }
  | { status: "unconfirmed" };

export class BroadcastUnconfirmedError extends Error {
  constructor() {
    super(
      "Broadcast sent, but no matching operation appeared on-chain within " +
        `${CONFIRM_TIMEOUT_MS / 1000}s. It may have been rejected — check your account history before retrying.`
    );
    this.name = "BroadcastUnconfirmedError";
  }
}

const ASSET_RE = /^(-?\d+(?:\.\d+)?)\s+([A-Z]+)$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Asset strings are compared by value, not spelling: the node re-serializes
 * amounts at the symbol's own precision, so "10.0 VIZ" and "10.000 VIZ" are the
 * same amount. Everything else compares strictly. */
function leafEquals(sent: unknown, seen: unknown): boolean {
  if (typeof sent === "string" && typeof seen === "string") {
    const a = ASSET_RE.exec(sent);
    const b = ASSET_RE.exec(seen);
    if (a && b) return Number(a[1]) === Number(b[1]) && a[2] === b[2];
  }
  return sent === seen;
}

/**
 * Subset comparison of the op body we signed against the one the chain emitted.
 *
 * Keys the chain omits are ignored: @viz-cx/core pads *every* op body with the
 * wire defaults (`memo`, `extensions`, `custom_sequence`, …) and the serializer
 * drops the ones that op doesn't declare, so our body legitimately carries
 * fields the chain never echoes back. Keys present on both sides must match.
 */
export function bodyMatches(sent: unknown, seen: unknown): boolean {
  if (Array.isArray(sent) || Array.isArray(seen)) {
    if (!Array.isArray(sent) || !Array.isArray(seen)) return false;
    if (sent.length !== seen.length) return false;
    return sent.every((v, i) => bodyMatches(v, seen[i]));
  }
  if (isPlainObject(sent) && isPlainObject(seen)) {
    return Object.entries(sent).every(([k, v]) => !(k in seen) || bodyMatches(v, seen[k]));
  }
  return leafEquals(sent, seen);
}

/** The server sends `op_id` as `<block>.<op-fraction>` (a float, despite
 * @viz-cx/api typing it as a string) — the integer part is the block number. */
function blockNumFromOpId(opId: unknown): number {
  const n = Number(opId);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export interface OpWatcher {
  /** Resolves true once the socket is live, false if it never opened in time. */
  opened: Promise<boolean>;
  /** Resolves `confirmed` on a match, `unconfirmed` after `timeoutMs`. */
  waitForMatch(timeoutMs: number): Promise<ConfirmOutcome>;
  /** Detach handlers and close the socket. Safe to call more than once. */
  stop(): void;
}

/**
 * Subscribe to the live stream and watch for one op. Call this *before*
 * broadcasting and wait on `opened`, otherwise a fast block can land the op
 * before the socket is listening.
 */
export function watchForOp(opType: string, body: Record<string, unknown>): OpWatcher {
  const stream = createApiClient({ wsUrl: WS_URL }).streamOps({ opType });

  let resolveOpened!: (open: boolean) => void;
  const opened = new Promise<boolean>((resolve) => { resolveOpened = resolve; });
  const openTimer = setTimeout(() => resolveOpened(false), SOCKET_OPEN_TIMEOUT_MS);
  const offStatus = stream.onStatus((s) => {
    if (s === "open") {
      clearTimeout(openTimer);
      resolveOpened(true);
    }
  });

  let resolveMatch!: (o: ConfirmOutcome) => void;
  const matched = new Promise<ConfirmOutcome>((resolve) => { resolveMatch = resolve; });
  const offMsg = stream.on((msg) => {
    // The server already filters by op_type; re-check in case it ever stops.
    if (msg.opType !== opType) return;
    if (!bodyMatches(body, msg.body ?? {})) return;
    resolveMatch({ status: "confirmed", blockNum: blockNumFromOpId(msg.opId) });
  });

  return {
    opened,
    waitForMatch(timeoutMs) {
      return new Promise<ConfirmOutcome>((resolve) => {
        const timer = setTimeout(() => resolve({ status: "unconfirmed" }), timeoutMs);
        void matched.then((outcome) => {
          clearTimeout(timer);
          resolve(outcome);
        });
      });
    },
    stop() {
      clearTimeout(openTimer);
      offStatus();
      offMsg();
      stream.close();
    },
  };
}
