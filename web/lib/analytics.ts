import { API_BASE } from "./config";
import { numTrim } from "./format";

export interface RewardBucket {
  symbol: string;
  total: number;
  count: number;
}
export interface RewardTimelinePoint {
  date: string;
  received: number;
  given: number;
}
export interface ActivityPoint {
  date: string;
  count: number;
}
export interface AccountAnalytics {
  account: string;
  available: boolean;
  range: {
    from: string | null;
    to: string | null;
    ops_scanned: number;
    window: "90d" | "2000ops";
    truncated: boolean;
  } | null;
  rewards: {
    received: RewardBucket[];
    given: RewardBucket[];
    timeline: RewardTimelinePoint[];
  } | null;
  activity: {
    by_category: Record<string, number>;
    timeline: ActivityPoint[];
  } | null;
}

/** Client-side fetch (used by the lazy AccountAnalytics island). */
export async function getAccountAnalytics(account: string): Promise<AccountAnalytics | null> {
  try {
    const res = await fetch(`${API_BASE}/analytics/${encodeURIComponent(account)}`);
    if (!res.ok) return null;
    return (await res.json()) as AccountAnalytics;
  } catch {
    return null;
  }
}

export function formatRewardTotals(buckets: RewardBucket[]): string {
  if (!buckets.length) return "0";
  return buckets.map((b) => `${numTrim(b.total)} ${b.symbol}`).join(" · ");
}

export function rangeLabel(range: AccountAnalytics["range"]): string {
  if (!range) return "No activity";
  return range.window === "2000ops" ? "Last 2,000 operations" : "Last 90 days";
}
