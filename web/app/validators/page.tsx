import type { Metadata } from "next";
import { withNode } from "@/lib/core";
import { NULL_SIGNING_KEY } from "@/lib/validator";
import { getChainInfo } from "@/lib/api";
import { Card, Empty, SectionTitle } from "@/components/ui";
import { ValidatorsTable, type ValidatorRow } from "@/components/tables/ValidatorsTable";
import { assetAmount, sharesToViz } from "@/lib/format";
import { ManageValidatorLink } from "@/components/ManageValidatorLink";

export const metadata: Metadata = { title: "Validators" };

interface RawValidator {
  owner?: string;
  url?: string;
  votes?: string | number;
  counted_votes?: string | number;
  running_version?: string;
  total_missed?: number;
  signing_key?: string;
  [k: string]: unknown;
}

/** Validator votes arrive as raw VESTS at 1e6 precision (e.g. "10165525698033"). */
const SHARES_PRECISION = 1_000_000;

export default async function ValidatorsPage() {
  let rows: ValidatorRow[] = [];
  let failed = false;
  let fund: string | number = "0";
  let totalShares: string | number = "0";

  try {
    const info = await getChainInfo();
    fund = info?.total_vesting_fund ?? "0";
    totalShares = info?.total_vesting_shares ?? "0";

    const names = await withNode((api) => api.getActiveValidators());
    const unique = [...new Set(names.filter(Boolean))];
    const vals = (await Promise.all(
      unique.map((n) => withNode((api) => api.getValidatorByAccount(n)).catch(() => null)),
    )) as (RawValidator | null)[];

    rows = vals
      .filter((v): v is RawValidator => !!v && !!v.owner)
      .map((v) => {
        const votesShares =
          assetAmount((v.counted_votes ?? v.votes) as string | number) / SHARES_PRECISION;
        return {
          name: v.owner!,
          voteWeight: sharesToViz(votesShares, fund, totalShares),
          version: v.running_version ?? "—",
          missed: v.total_missed ?? 0,
          running: (v.signing_key ?? NULL_SIGNING_KEY) !== NULL_SIGNING_KEY,
          url: v.url ?? "",
        };
      })
      .sort((a, b) => b.voteWeight - a.voteWeight)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  } catch {
    failed = true;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Validators</h1>
          <p className="mt-1 font-prose text-sm text-fg-dim">
            The active validator set producing blocks on VIZ (DPoS). The{" "}
            <span className="text-acc-green">top 11</span> by vote weight form the consensus set. Click a
            column to sort.
          </p>
        </div>
        <ManageValidatorLink />
      </div>

      {failed || rows.length === 0 ? (
        <Card pad={false}>
          <Empty>
            {failed
              ? "Could not reach a VIZ node to load the validator set. Try again shortly."
              : "No active validators reported."}
          </Empty>
        </Card>
      ) : (
        <>
          <SectionTitle>{rows.length} active validators</SectionTitle>
          <ValidatorsTable rows={rows} fund={fund} totalShares={totalShares} />
        </>
      )}
    </div>
  );
}
