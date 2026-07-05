"use client";

import { useEffect, useState } from "react";
import { BarRow, Sparkline } from "./MiniCharts";
import { Empty, SectionTitle, StatStrip, StatTile } from "./ui";
import {
  type AccountAnalytics as Analytics,
  formatRewardTotals,
  getAccountAnalytics,
  rangeLabel,
} from "@/lib/analytics";

const CATEGORY_ORDER = ["award", "transfer", "governance", "account", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  award: "Awards",
  transfer: "Transfers",
  governance: "Governance",
  account: "Account",
  other: "Other",
};

export function AccountAnalytics({ account }: { account: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  // Reset to the loading state when the account changes (render-phase, before paint).
  const [prevAccount, setPrevAccount] = useState(account);
  if (prevAccount !== account) {
    setPrevAccount(account);
    setState("loading");
  }

  useEffect(() => {
    let live = true;
    getAccountAnalytics(account).then((res) => {
      if (!live) return;
      if (!res) {
        setState("error");
        return;
      }
      setData(res);
      setState("ready");
    });
    return () => {
      live = false;
    };
  }, [account]);

  return (
    <div>
      <SectionTitle right={data?.available ? rangeLabel(data.range) : undefined}>
        Analytics
      </SectionTitle>

      {state === "loading" && <Empty>Loading analytics…</Empty>}
      {state === "error" && <Empty>Could not load analytics.</Empty>}
      {state === "ready" && data && !data.available && (
        <Empty>No history available for this account.</Empty>
      )}

      {state === "ready" && data?.available && data.rewards && data.activity && (
        <div className="flex flex-col gap-5">
          <StatStrip>
            <StatTile label="Received" value={formatRewardTotals(data.rewards.received)} tone="green" />
            <StatTile label="Given" value={formatRewardTotals(data.rewards.given)} tone="blue" />
            <StatTile label="Operations" value={data.range?.ops_scanned ?? 0} />
          </StatStrip>

          <div>
            <p className="mb-1 font-prose text-xs text-fg-muted">Rewards received over time</p>
            <Sparkline points={data.rewards.timeline.map((p) => p.received)} />
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-prose text-xs text-fg-muted">Activity by type</p>
            {(() => {
              const cats = data.activity!.by_category;
              const max = Math.max(1, ...CATEGORY_ORDER.map((c) => cats[c] ?? 0));
              return CATEGORY_ORDER.filter((c) => (cats[c] ?? 0) > 0).map((c) => (
                <BarRow key={c} label={CATEGORY_LABEL[c]} value={cats[c] ?? 0} max={max} />
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
