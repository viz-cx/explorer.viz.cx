import type { MetadataRoute } from "next";
import { TUTORIALS } from "./learn/tutorials";

const BASE = "https://viz.cx";

// The crawlable, stable surface of the explorer. Per-account / per-block / per-tx
// pages are effectively unbounded and change constantly, so they're left to
// organic discovery rather than enumerated here.
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/richlist", changeFrequency: "daily", priority: 0.8 },
  { path: "/validators", changeFrequency: "daily", priority: 0.8 },
  { path: "/committee", changeFrequency: "daily", priority: 0.6 },
  { path: "/dashboard", changeFrequency: "hourly", priority: 0.7 },
  { path: "/invite", changeFrequency: "monthly", priority: 0.5 },
  { path: "/learn", changeFrequency: "weekly", priority: 0.6 },
  { path: "/dev", changeFrequency: "weekly", priority: 0.5 },
  { path: "/dev/playground", changeFrequency: "weekly", priority: 0.4 },
  { path: "/dev/sdk", changeFrequency: "weekly", priority: 0.4 },
  { path: "/dev/rpc", changeFrequency: "weekly", priority: 0.4 },
  { path: "/dev/rest", changeFrequency: "weekly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const tutorialEntries = TUTORIALS.map((t) => ({
    url: `${BASE}/learn/${t.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...staticEntries, ...tutorialEntries];
}
