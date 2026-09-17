import type { MetadataRoute } from "next";

// Crawlers may index the whole public explorer. /notifications and /wallet are
// per-user client-only views with no server-rendered content worth indexing,
// and /search is a query-results endpoint — keep them out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/notifications", "/wallet", "/search"],
    },
    sitemap: "https://explorer.viz.cx/sitemap.xml",
    host: "https://explorer.viz.cx",
  };
}
