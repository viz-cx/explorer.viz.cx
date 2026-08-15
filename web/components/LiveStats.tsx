"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { withNode } from "@/lib/core";
import { StatTile, StatStrip } from "./ui";
import { AccountChip } from "./AccountChip";
import { assetAmount, compact } from "@/lib/format";

export interface HomeStats {
  head?: number;
  supply?: string;
  vestFund?: string;
  validator?: string | null;
}

/**
 * Headline stats on the home page. Seeded by the Server Component so first
 * paint stays SEO-friendly, then re-polled from the node every block — without
 * this they froze at their SSR values until a manual reload, on a page that
 * calls itself real-time.
 */
export function LiveStats({ initial }: { initial: HomeStats }) {
  const [s, setS] = useState(initial);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const dgp = await withNode((api) => api.getDynamicGlobalProperties());
        if (!active) return;
        setS({
          head: dgp.head_block_number,
          supply: dgp.current_supply as string | undefined,
          vestFund: dgp.total_vesting_fund,
          validator: dgp.current_validator ?? dgp.current_witness ?? null,
        });
      } catch {
        // All nodes down — keep the last good values rather than blanking out.
      }
    }
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const supply = assetAmount(s.supply);
  const vestFund = assetAmount(s.vestFund);

  return (
    <StatStrip>
      <StatTile
        label="Head block"
        value={s.head ? s.head.toLocaleString("en-US") : "—"}
        tone="blue"
        sub={
          s.head ? (
            <Link href={`/block/${s.head}`} className="hover:text-fg">
              view latest →
            </Link>
          ) : undefined
        }
      />
      <StatTile label="Current supply" value={supply ? `${compact(supply)} VIZ` : "—"} />
      <StatTile
        label="Vesting fund"
        value={vestFund ? `${compact(vestFund)} VIZ` : "—"}
        tone="green"
      />
      <StatTile
        label="Current validator"
        value={s.validator ? <AccountChip name={s.validator} size={20} /> : "—"}
      />
    </StatStrip>
  );
}
