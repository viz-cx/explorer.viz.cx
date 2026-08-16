import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { LiveFeed } from "@/components/LiveFeed";
import { LiveStats } from "@/components/LiveStats";
import { Card, SectionTitle } from "@/components/ui";
import { getChainInfo } from "@/lib/api";

export default async function Home() {
  const info = await getChainInfo();

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col items-center gap-5 pt-8 pb-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          VIZ<span className="text-fg-dim">.cx</span>
        </h1>
        <p className="max-w-xl font-prose text-sm text-fg-muted sm:text-base">
          The block explorer and network dashboard for the VIZ blockchain. Search any
          block, account, or transaction — live.
        </p>
        <div className="w-full max-w-2xl">
          <SearchBox size="lg" autoFocus />
        </div>
      </section>

      {/* Headline stats — SSR-seeded, then live from the node */}
      <LiveStats
        initial={{
          head: info?.head_block_number,
          supply: info?.current_supply as string | undefined,
          vestFund: info?.total_vesting_fund as string | undefined,
          validator:
            (info?.current_validator as string | undefined) ??
            (info?.current_witness as string | undefined) ??
            null,
        }}
      />

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
