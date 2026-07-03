import { describe, expect, it } from "vitest";
import { formatRewardTotals, rangeLabel } from "@/lib/analytics";

describe("formatRewardTotals", () => {
  it("formats a single symbol", () => {
    expect(formatRewardTotals([{ symbol: "SHARES", total: 2.5, count: 2 }])).toBe("2.5 SHARES");
  });
  it("joins multiple symbols", () => {
    expect(
      formatRewardTotals([
        { symbol: "SHARES", total: 2.5, count: 2 },
        { symbol: "VIZ", total: 1, count: 1 },
      ]),
    ).toBe("2.5 SHARES · 1 VIZ");
  });
  it("returns 0 for empty", () => {
    expect(formatRewardTotals([])).toBe("0");
  });
});

describe("rangeLabel", () => {
  it("labels the day window", () => {
    expect(rangeLabel({ from: "x", to: "y", ops_scanned: 5, window: "90d", truncated: false })).toBe(
      "Last 90 days",
    );
  });
  it("labels the op-cap window", () => {
    expect(
      rangeLabel({ from: "x", to: "y", ops_scanned: 2000, window: "2000ops", truncated: true }),
    ).toBe("Last 2,000 operations");
  });
  it("labels null range", () => {
    expect(rangeLabel(null)).toBe("No activity");
  });
});
