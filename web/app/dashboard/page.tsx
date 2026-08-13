import Link from "next/link";
import type { Metadata } from "next";
import { getChainInfo, getLatestBlock, getBlock } from "@/lib/api";
import { Card, DefRow, SectionTitle, StatStrip, StatTile, Empty } from "@/components/ui";
import { StackedBar } from "@/components/charts";
import { AccountChip } from "@/components/AccountChip";
import { assetAmount, compact, num, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Network dashboard" };

export default async function DashboardPage() {
  const [info, latest] = await Promise.all([getChainInfo(), getLatestBlock()]);
  const head = info?.head_block_number ?? latest?._id;

  const supply = assetAmount(info?.current_supply as string | undefined);
  const capital = assetAmount(info?.total_vesting_fund as string | undefined);
  const dao = assetAmount(info?.committee_fund as string | undefined);
  const rewards = assetAmount(info?.total_reward_fund as string | undefined);
  const liquid = Math.max(0, supply - capital - dao - rewards);
  const currentValidator =
    (info?.current_validator as string | undefined) ??
    (info?.current_witness as string | undefined) ??
    null;

  // Recent blocks strip (best-effort; immutable so cached hard).
  const recentNums = head ? Array.from({ length: 8 }, (_, i) => head - i) : [];
  const recent = await Promise.all(recentNums.map((n) => getBlock(n)));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Network dashboard</h1>
        <p className="mt-1 font-prose text-sm text-fg-dim">Live state of the VIZ chain.</p>
      </div>

      <StatStrip>
        <StatTile
          label="Head block"
          value={head ? head.toLocaleString("en-US") : "—"}
          tone="blue"
          sub={head ? <Link href={`/block/${head}`} className="hover:text-fg">view →</Link> : undefined}
        />
        <StatTile label="Total supply" value={supply ? `${compact(supply)} VIZ` : "—"} />
        <StatTile label="Vesting (capital)" value={capital ? `${compact(capital)} VIZ` : "—"} tone="green" />
        <StatTile
          label="Current validator"
          value={currentValidator ? <AccountChip name={currentValidator} size={20} /> : "—"}
        />
      </StatStrip>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Supply breakdown</SectionTitle>
          {supply > 0 ? (
            <StackedBar
              segments={[
                { label: "Liquid", value: liquid, color: "var(--color-acc-blue)" },
                { label: "Capital", value: capital, color: "var(--color-acc-green)" },
                { label: "DAO fund", value: dao, color: "var(--color-acc-violet)" },
                { label: "Rewards", value: rewards, color: "var(--color-acc-amber)" },
              ]}
            />
          ) : (
            <Empty>Supply data unavailable.</Empty>
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-6">
            <DefRow label="Liquid">{num(liquid, 0)} VIZ</DefRow>
            <DefRow label="Capital">{num(capital, 0)} VIZ</DefRow>
            <DefRow label="DAO fund">{num(dao, 0)} VIZ</DefRow>
            <DefRow label="Rewards">{num(rewards, 0)} VIZ</DefRow>
          </div>
        </Card>

        <Card>
          <SectionTitle>Chain parameters</SectionTitle>
          <DefRow label="Total vesting shares">
            {num(assetAmount(info?.total_vesting_shares as string | undefined), 0)}
          </DefRow>
          <DefRow label="Total reward shares">
            {num(assetAmount(info?.total_reward_shares as string | undefined), 0)}
          </DefRow>
          <DefRow label="Committee fund">{num(dao, 3)} VIZ</DefRow>
          <DefRow label="Current slot">{(info?.current_aslot as number) ?? "—"}</DefRow>
          <DefRow label="Head block id">
            <span className="text-fg-muted">{(info?.head_block_id as string)?.slice(0, 16) ?? "—"}…</span>
          </DefRow>
        </Card>
      </div>

      <div>
        <SectionTitle
          right={
            <Link href="/validators" className="font-prose text-xs text-acc-blue hover:underline">
              validators →
            </Link>
          }
        >
          Recent blocks
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {recent.filter(Boolean).map((blk) => {
            const txs = new Set(blk!.block.filter((o) => o.trx_id).map((o) => o.trx_id)).size;
            const ts = blk!.block[0]?.timestamp;
            return (
              <Link
                key={blk!._id}
                href={`/block/${blk!._id}`}
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-border-strong"
              >
                <span className="text-sm font-medium text-acc-blue">#{blk!._id.toLocaleString("en-US")}</span>
                <span className="text-[11px] text-fg-dim">
                  {txs} tx · {blk!.block.length} ops
                </span>
                {ts && <span className="text-[11px] text-fg-dim">{timeAgo(ts)}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
