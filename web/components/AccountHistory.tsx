"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withNode } from "@/lib/core";
import { OpRow } from "./OpRow";
import { decodeOp, type OpCategory } from "@/lib/ops";
import type { OpRecord } from "@/lib/types";

type HistItem = OpRecord & { block: number };
type HistEntry = readonly [number, HistItem];

const PAGE = 25;

const TABS: { key: "all" | OpCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "transfer", label: "Transfers" },
  { key: "award", label: "Awards" },
  { key: "governance", label: "Governance" },
  { key: "account", label: "Account" },
];

/**
 * Paginated account operation history via the node's get_account_history.
 * Sequence numbers run oldest→newest; we load from the tip and page backwards.
 */
export function AccountHistory({ account }: { account: string }) {
  const [entries, setEntries] = useState<HistEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null); // next `from` seq, null = not started
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const [tab, setTab] = useState<"all" | OpCategory>("all");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (from: number) => {
      setLoading(true);
      setError(false);
      try {
        const limit = from < 0 ? PAGE : Math.min(PAGE, from);
        const batch = (await withNode((api) =>
          api.getAccountHistory(account, from, limit),
        )) as unknown as HistEntry[];
        if (batch.length === 0) {
          setDone(true);
          return;
        }
        // Ascending by seq; newest last. Prepend older page below existing.
        const sorted = [...batch].sort((a, b) => b[0] - a[0]);
        setEntries((prev) => [...prev, ...sorted.filter((e) => !prev.some((p) => p[0] === e[0]))]);
        const lowest = batch[0][0];
        if (lowest <= 0) setDone(true);
        else setCursor(lowest - 1);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [account],
  );

  // Reset the list when the account changes (render-phase, before paint).
  const [prevAccount, setPrevAccount] = useState(account);
  if (prevAccount !== account) {
    setPrevAccount(account);
    setEntries([]);
    setDone(false);
    setCursor(null);
  }

  useEffect(() => {
    void (async () => {
      await load(-1);
    })();
  }, [load]);

  // Auto-load the next older page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done || error || loading || cursor === null) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) load(cursor);
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [load, cursor, done, error, loading]);

  const visible = entries.filter(
    ([, item]) => tab === "all" || decodeOp(item.op[0], item.op[1]).category === tab,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-2.5 py-1 font-prose text-xs ${
              tab === t.key ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {visible.length === 0 && !loading && (
          <div className="px-4 py-10 text-center text-sm text-fg-dim">
            {error ? "Could not load history from the node." : "No operations to show."}
          </div>
        )}
        {visible.map(([seq, item]) => (
          <OpRow
            key={seq}
            type={item.op[0]}
            body={item.op[1]}
            timestamp={item.timestamp}
            href={`/block/${item.block}`}
            metaLabel={`#${item.block.toLocaleString("en-US")}`}
          />
        ))}
      </div>

      <div
        ref={sentinelRef}
        className="flex items-center justify-center gap-3 py-2"
        aria-live="polite"
      >
        {error && (
          <button
            onClick={() => load(cursor ?? -1)}
            className="rounded-md border border-acc-red/40 px-3 py-1.5 text-sm text-acc-red hover:bg-acc-red/10"
          >
            Retry
          </button>
        )}
        {!done && !error && loading && (
          <span className="font-prose text-xs text-fg-dim">Loading…</span>
        )}
        {done && entries.length > 0 && (
          <span className="font-prose text-xs text-fg-dim">— beginning of history —</span>
        )}
      </div>
    </div>
  );
}
