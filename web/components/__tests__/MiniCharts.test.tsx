import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarRow, Sparkline } from "@/components/MiniCharts";

describe("Sparkline", () => {
  it("renders a path for non-empty points", () => {
    const html = renderToStaticMarkup(<Sparkline points={[1, 3, 2, 5]} />);
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
  });
  it("renders no path when all zero", () => {
    const html = renderToStaticMarkup(<Sparkline points={[0, 0, 0]} />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("<path");
  });
});

describe("BarRow", () => {
  it("shows the label and value", () => {
    const html = renderToStaticMarkup(<BarRow label="award" value={99} max={99} />);
    expect(html).toContain("award");
    expect(html).toContain("99");
  });
});
