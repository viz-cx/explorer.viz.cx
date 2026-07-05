import type { Metadata } from "next";
import { getRichlist } from "@/lib/api";
import { Card, Empty, SectionTitle } from "@/components/ui";
import { RichlistTable } from "@/components/tables/RichlistTable";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Richlist" };

export default async function RichlistPage() {
  const data = await getRichlist();
  const rows = data?.accounts ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Richlist</h1>
        <p className="mt-1 font-prose text-sm text-fg-dim">
          Top accounts by holdings. Capital is staked SHARES valued in VIZ; effective is
          delegation-adjusted vote weight; wallet is liquid + capital.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card pad={false}>
          <Empty>
            {data && data.updated_at === null
              ? "The richlist snapshot is still being built — check back in a few minutes."
              : "Richlist unavailable right now."}
          </Empty>
        </Card>
      ) : (
        <>
          <SectionTitle
            right={
              <span className="font-prose text-xs text-fg-dim">
                {data?.total_accounts ? `${data.total_accounts.toLocaleString("en-US")} accounts · ` : ""}
                updated {data?.updated_at ? timeAgo(data.updated_at) : "—"}
              </span>
            }
          >
            Top {rows.length}
          </SectionTitle>
          <RichlistTable rows={rows} />
        </>
      )}
    </div>
  );
}
