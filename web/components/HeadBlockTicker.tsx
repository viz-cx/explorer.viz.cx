"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { withNode } from "@/lib/core";

/**
 * Live head-block indicator with a green "alive" pulse. Polls the node's
 * dynamic global properties every few seconds (node-failover aware). Degrades
 * to a dim dot if all nodes are unreachable.
 */
export function HeadBlockTicker() {
  const [head, setHead] = useState<number | null>(null);
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    let active = true;
    async function tick() {
      if (document.hidden) return; // 1s polling: don't load the public node from background tabs
      try {
        const dgp = await withNode((api) => api.getDynamicGlobalProperties());
        if (!active) return;
        setHead(dgp.head_block_number);
        setAlive(true);
      } catch {
        if (active) setAlive(false);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href={head ? `/block/${head}` : "/"}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] hover:border-border-strong"
      title={alive ? "Live head block" : "Reconnecting to node…"}
    >
      <span
        className={`h-2 w-2 rounded-full ${alive ? "bg-acc-green pulse-dot" : "bg-fg-dim"}`}
        aria-hidden
      />
      <span className="font-prose text-[10px] tracking-wider text-fg-dim uppercase">Block</span>
      <span className="tabular-nums text-fg">{head ? head.toLocaleString("en-US") : "—"}</span>
    </Link>
  );
}
