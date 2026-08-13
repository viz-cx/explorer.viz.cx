import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProfile, getChainInfo } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Card, DefRow, SectionTitle, StatTile, StatStrip } from "@/components/ui";
import { EnergyMeter } from "@/components/EnergyMeter";
import { AccountAnalytics } from "@/components/AccountAnalytics";
import { AccountHistory } from "@/components/AccountHistory";
import { AccountChip } from "@/components/AccountChip";
import { AwardButton } from "@/components/AwardButton";
import { WatchToggle } from "@/components/WatchToggle";
import {
  assetAmount,
  bareAccount,
  currentEnergy,
  effectiveShares,
  formatUTC,
  num,
  sharesToViz,
  timeAgo,
} from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ account: string }>;
}): Promise<Metadata> {
  const { account } = await params;
  const user = bareAccount(decodeURIComponent(account));
  return { title: `@${user}` };
}

export default async function AccountPage({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  const user = bareAccount(decodeURIComponent(account));

  const [profile, info] = await Promise.all([getProfile(user), getChainInfo()]);
  if (!profile) notFound();

  const fund = info?.total_vesting_fund ?? "0";
  const totalShares = info?.total_vesting_shares ?? "0";

  const liquid = assetAmount(profile.balance);
  const ownShares = assetAmount(profile.vesting_shares);
  const effShares = effectiveShares(profile);
  const delegatedOut = assetAmount(profile.delegated_vesting_shares);
  const receivedIn = assetAmount(profile.received_vesting_shares);

  const ownVizValue = sharesToViz(ownShares, fund, totalShares);
  const effVizValue = sharesToViz(effShares, fund, totalShares);
  const energy = currentEnergy(profile.energy, profile.last_vote_time);

  const meta = profile.json_metadata?.profile ?? {};
  const displayName = (meta.name as string) || null;
  const about = (meta.about as string) || null;

  return (
    <div className="flex flex-col gap-6">
      {/* Identity header */}
      <div className="flex items-start gap-4">
        <Avatar name={user} size={56} />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">@{user}</h1>
            <AwardButton receiver={user} />
            <WatchToggle account={user} />
          </div>
          {displayName && <p className="font-prose text-sm text-fg-muted">{displayName}</p>}
          <p className="mt-0.5 font-prose text-xs text-fg-dim">
            {profile.created ? (
              <>
                Account created {formatUTC(profile.created)} ({timeAgo(profile.created)})
              </>
            ) : (
              `Account #${profile.id}`
            )}
          </p>
          {about && <p className="mt-2 max-w-2xl font-prose text-sm text-fg-muted">{about}</p>}
        </div>
      </div>

      {/* Headline balances */}
      <StatStrip>
        <StatTile label="Liquid" value={`${num(liquid)} VIZ`} tone="blue" />
        <StatTile
          label="Capital (SHARES)"
          value={num(ownShares, 3)}
          sub={`≈ ${num(ownVizValue)} VIZ`}
          tone="green"
        />
        <StatTile
          label="Effective shares"
          value={num(effShares, 3)}
          sub={`≈ ${num(effVizValue)} VIZ vote weight`}
        />
        <StatTile label="Energy" value={`${energy.toFixed(1)}%`} tone="amber" />
      </StatStrip>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left: detail panels */}
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle>Energy</SectionTitle>
            <EnergyMeter percent={energy} />
            <p className="mt-2 font-prose text-[11px] text-fg-dim">
              Regenerates fully over ~5 days. Last activity{" "}
              {profile.last_vote_time ? timeAgo(profile.last_vote_time) : "unknown"}.
            </p>
          </Card>

          <Card>
            <SectionTitle>Shares &amp; delegation</SectionTitle>
            <DefRow label="Own SHARES">{num(ownShares, 6)}</DefRow>
            <DefRow label="Delegated out">{num(delegatedOut, 6)}</DefRow>
            <DefRow label="Received in">{num(receivedIn, 6)}</DefRow>
            <DefRow label="Effective">{num(effShares, 6)}</DefRow>
            <DefRow label="≈ VIZ value">{num(effVizValue)} VIZ</DefRow>
          </Card>

          <Card>
            <SectionTitle>Governance</SectionTitle>
            <DefRow label="Validator votes">{profile.validators_voted_for ?? profile.witnesses_voted_for ?? 0}</DefRow>
            <DefRow label="Vote proxy">
              {profile.proxy ? <AccountChip name={profile.proxy} size={16} /> : "none"}
            </DefRow>
          </Card>
        </div>

        {/* Right: analytics + operation history (both client islands) */}
        <div className="flex flex-col gap-6">
          <AccountAnalytics account={user} />
          <div>
            <SectionTitle>Operation history</SectionTitle>
            <AccountHistory account={user} />
          </div>
        </div>
      </div>
    </div>
  );
}
