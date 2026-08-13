"use client";

import { useState, useEffect, useCallback } from "react";
import { createHttpTransport, createReadApi } from "@viz-cx/core";
import { DataTable, type Column } from "@/components/DataTable";
import { AccountChip } from "@/components/AccountChip";
import { ValidatorVoteButton } from "@/components/ValidatorVoteButton";
import { ValidatorProxyBanner } from "@/components/ValidatorProxyBanner";
import { compact, assetAmount, sharesToViz } from "@/lib/format";
import { useWallet } from "@/lib/wallet";
import { NODE_ENDPOINTS } from "@/lib/config";

export interface ValidatorRow {
  rank: number;
  name: string;
  voteWeight: number;
  version: string;
  missed: number;
  running: boolean;
  url: string;
}

const SHARES_PRECISION = 1_000_000;

/** Top-voted validators that form the consensus block-producing set on VIZ. */
const TOP_VALIDATORS = 11;

export function ValidatorsTable({
  rows,
  fund,
  totalShares,
}: {
  rows: ValidatorRow[];
  fund: string | number;
  totalShares: string | number;
}) {
  const wallet = useWallet();
  const [votedSet, setVotedSet] = useState<Set<string>>(new Set());
  const [proxy, setProxy] = useState("");
  const [proxiedWeightViz, setProxiedWeightViz] = useState(0);

  const fetchAccount = useCallback(() => {
    if (!wallet.account) return;
    let cancelled = false;
    const transport = createHttpTransport(NODE_ENDPOINTS[0]);
    const api = createReadApi(transport);
    api.getAccounts([wallet.account])
      .then(([acc]) => {
        if (cancelled || !acc) return;
        setVotedSet(new Set(((acc['validator_votes'] ?? acc['witness_votes']) as string[] | undefined) ?? []));
        setProxy((acc['proxy'] as string | undefined) ?? "");
        const levels = (acc['proxied_vsf_votes'] as (string | number)[] | undefined) ?? [];
        const rawSum = levels.reduce<number>((s, v) => s + assetAmount(v), 0);
        setProxiedWeightViz(sharesToViz(rawSum / SHARES_PRECISION, fund, totalShares));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wallet.account, fund, totalShares]);

  // Clear vote state when no account is connected (render-phase, before paint).
  const [prevAccount, setPrevAccount] = useState(wallet.account);
  if (prevAccount !== wallet.account) {
    setPrevAccount(wallet.account);
    if (!wallet.account) { setVotedSet(new Set()); setProxy(""); setProxiedWeightViz(0); }
  }

  useEffect(() => {
    return fetchAccount();
  }, [fetchAccount]);

  const columns: Column<ValidatorRow>[] = [
    {
      key: "rank",
      header: "#",
      cell: (r) => (
        <span className={r.rank <= TOP_VALIDATORS ? "font-semibold text-acc-green" : "text-fg-dim"}>
          {r.rank}
        </span>
      ),
      sort: (r) => r.rank,
    },
    {
      key: "name",
      header: "Validator",
      cell: (r) => <AccountChip name={r.name} size={18} />,
      sort: (r) => r.name,
    },
    {
      key: "status",
      header: "Status",
      hideOnMobile: true,
      cell: (r) => (
        <span className={`inline-flex items-center gap-1.5 ${r.running ? "text-acc-green" : "text-fg-dim"}`}>
          <span className={`h-2 w-2 rounded-full ${r.running ? "bg-acc-green" : "bg-fg-dim"}`} />
          {r.running ? "running" : "idle"}
        </span>
      ),
      sort: (r) => (r.running ? 1 : 0),
    },
    {
      key: "votes",
      header: "Vote weight (VIZ)",
      align: "right",
      cell: (r) => compact(r.voteWeight),
      sort: (r) => r.voteWeight,
    },
    {
      key: "missed",
      header: "Missed",
      hideOnMobile: true,
      align: "right",
      cell: (r) => <span className={r.missed > 0 ? "text-acc-amber" : ""}>{r.missed.toLocaleString("en-US")}</span>,
      sort: (r) => r.missed,
    },
    {
      key: "version",
      header: "Version",
      hideOnMobile: true,
      align: "right",
      cell: (r) => <span className="text-fg-muted">{r.version}</span>,
      sort: (r) => r.version,
    },
    {
      key: "vote",
      header: "Vote",
      align: "right",
      cell: (r) => (
        <ValidatorVoteButton
          validator={r.name}
          currentlyVoted={votedSet.has(r.name)}
          disabled={proxy !== ""}
          onVote={fetchAccount}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ValidatorProxyBanner
        currentProxy={proxy}
        proxiedWeightViz={proxiedWeightViz}
        onChanged={fetchAccount}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.name}
        initialSort={{ key: "votes", dir: "desc" }}
        rowClassName={(r) => (r.rank <= TOP_VALIDATORS ? "bg-acc-green/5" : undefined)}
      />
    </div>
  );
}
