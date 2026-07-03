/**
 * Hand-rolled SVG micro-charts — no charting dependency (matches the project's
 * hand-rolled toast/UI ethos). Pure presentational; safe to SSR.
 */

const W = 240;
const H = 48;

export function Sparkline({ points, className = "" }: { points: number[]; className?: string }) {
  const max = Math.max(0, ...points);
  const hasData = points.length > 1 && max > 0;
  let d = "";
  if (hasData) {
    const step = W / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = i * step;
      const y = H - (p / max) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    d = `M${coords.join(" L")}`;
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`h-12 w-full ${className}`}
      aria-hidden="true"
    >
      {d && (
        <>
          <path d={`${d} L${W},${H} L0,${H} Z`} className="fill-acc-green/10" />
          <path d={d} className="fill-none stroke-acc-green" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}

export function BarRow({
  label,
  value,
  max,
  tone = "blue",
}: {
  label: string;
  value: number;
  max: number;
  tone?: "green" | "blue" | "fg";
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barClass = { green: "bg-acc-green", blue: "bg-acc-blue", fg: "bg-fg-muted" }[tone];
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 font-prose text-xs text-fg-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-fg">{value}</span>
    </div>
  );
}
