import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { LiveFeed } from "@/components/LiveFeed";
import { StatTile, StatStrip, Card, SectionTitle } from "@/components/ui";
import { AccountChip } from "@/components/AccountChip";
import { getChainInfo } from "@/lib/api";
import { assetAmount, compact } from "@/lib/format";

export default async function Home() {
  const info = await getChainInfo();
  const head = info?.head_block_number;
  const supply = assetAmount(info?.current_supply as string | undefined);
  const vestFund = assetAmount(info?.total_vesting_fund as string | undefined);
  const witness = (info?.current_witness as string | undefined) ?? null;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col items-center gap-5 pt-8 pb-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          VIZ<span className="text-fg-dim">.cx</span>
        </h1>
        <p className="max-w-xl font-prose text-sm text-fg-muted sm:text-base">
          The English-first block explorer and network dashboard for the VIZ blockchain. Search any
          block, account, or transaction — live.
        </p>
        <div className="w-full max-w-2xl">
          <SearchBox size="lg" autoFocus />
        </div>
      </section>

      {/* Headline stats */}
      <StatStrip>
        <StatTile
          label="Head block"
          value={head ? head.toLocaleString("en-US") : "—"}
          tone="blue"
          sub={
            head ? (
              <Link href={`/block/${head}`} className="hover:text-fg">
                view latest →
              </Link>
            ) : undefined
          }
        />
        <StatTile label="Current supply" value={supply ? `${compact(supply)} VIZ` : "—"} />
        <StatTile label="Vesting fund" value={vestFund ? `${compact(vestFund)} VIZ` : "—"} tone="green" />
        <StatTile
          label="Current validator"
          value={witness ? <AccountChip name={witness} size={20} /> : "—"}
        />
      </StatStrip>

      {/* Live feed */}
      <section>
        <SectionTitle
          right={
            <Link href="/dashboard" className="font-prose text-xs text-acc-blue hover:underline">
              Network dashboard →
            </Link>
          }
        >
          Real-time activity
        </SectionTitle>
        <Card pad={false} className="overflow-hidden">
          <LiveFeed />
        </Card>
      </section>
    </div>
  );
}
