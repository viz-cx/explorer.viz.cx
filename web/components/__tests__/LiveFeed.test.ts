import { describe, expect, it } from "vitest";
import { mergeOps } from "../LiveFeed";

const op = (op_id: string) => ({ op_id, op_type: "transfer", body: {} });

describe("mergeOps", () => {
  it("dedupes ops seen on both the seed and the socket, newest first", () => {
    const merged = mergeOps([op("12.00002"), op("12.00001")], [op("12.00001"), op("11.00001")]);
    expect(merged.map((o) => o.op_id)).toEqual(["12.00002", "12.00001", "11.00001"]);
  });

  it("caps the list at 50 rows", () => {
    const many = Array.from({ length: 80 }, (_, i) => op(String(i + 1)));
    const merged = mergeOps(many, []);
    expect(merged).toHaveLength(50);
    expect(merged[0].op_id).toBe("80");
  });
});
