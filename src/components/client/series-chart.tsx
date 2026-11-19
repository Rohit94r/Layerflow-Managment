"use client";

import { useMemo, useState } from "react";
import { cn, formatDate } from "@/lib/format";

export type SeriesMetric = { key: string; label: string; format?: "int" | "pct" };
type Row = { day: string } & Record<string, number | string>;

const fmt = (m: SeriesMetric, v: number) => (m.format === "pct" ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US"));

/**
 * Daily trend for one metric at a time (never two y-axes). Hover/touch crosshair with tooltip,
 * and a table view for exact values and screen readers.
 */
export function SeriesChart({ data, metrics, source }: { data: Row[]; metrics: SeriesMetric[]; source?: string }) {
  const [key, setKey] = useState(metrics[0]!.key);
  const [hover, setHover] = useState<number | null>(null);
  const metric = metrics.find((m) => m.key === key)!;
  const W = 720;
  const H = 190;
  const P = { l: 46, r: 12, t: 12, b: 26 };
  const values = data.map((d) => Number(d[key] ?? 0));
  const { max, path, area, xs, ys } = useMemo(() => {
    const mx = Math.max(...values, metric.format === "pct" ? 0.01 : 1);
    const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1);
    const y = (v: number) => H - P.b - (v / (mx || 1)) * (H - P.t - P.b);
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    return { max: mx, path: d, area: `${d}L${x(values.length - 1).toFixed(1)},${H - P.b}L${P.l},${H - P.b}Z`, xs: pts.map((p) => p[0]), ys: pts.map((p) => p[1]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, key]);
  if (!data.length) return null;
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Metric">
        {metrics.map((m) => (
          <button key={m.key} role="tab" aria-selected={key === m.key} onClick={() => setKey(m.key)}
            className={cn("rounded-md px-2.5 py-1 text-[12.5px]", key === m.key ? "bg-ink text-bg" : "text-ink-2 hover:bg-sunken")}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y select-none" role="img"
          aria-label={`Daily ${metric.label} from ${data[0]!.day} to ${data.at(-1)!.day}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - px) < Math.abs(xs[best]! - px)) best = i;
            setHover(best);
          }}>
          {[0, 0.5, 1].map((t) => {
            const y = H - P.b - t * (H - P.t - P.b);
            return (
              <g key={t}>
                <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
                <text x={P.l - 6} y={y + 4} textAnchor="end" className="fill-muted text-[10.5px] tabular-nums">{fmt(metric, t * max)}</text>
              </g>
            );
          })}
          <path d={area} fill="var(--chart)" opacity={0.08} />
          <path d={path} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
            <text key={i} x={xs[i]} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="fill-muted text-[10.5px]">
              {formatDate(data[i]!.day, { month: "short", day: "numeric" })}
            </text>
          ))}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={xs[hover]} x2={xs[hover]} y1={P.t} y2={H - P.b} stroke="var(--line-strong)" strokeWidth={1} />
              <circle cx={xs[hover]} cy={ys[hover]} r={4.5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] shadow-float"
            style={{ left: `${Math.min(85, Math.max(15, (xs[hover]! / W) * 100))}%` }}>
            <div className="font-medium text-ink">{formatDate(h.day, { weekday: "short", month: "short", day: "numeric" })}</div>
            {metrics.map((m) => (
              <div key={m.key} className={cn("tabular-nums", m.key === key ? "text-ink" : "text-muted")}>{m.label}: {fmt(m, Number(h[m.key] ?? 0))}</div>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2 text-[12.5px]">
        <summary className="cursor-pointer text-muted">View as table{source ? ` · ${source}` : ""}</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="table">
            <thead><tr><th>Date</th>{metrics.map((m) => <th key={m.key} className="text-right">{m.label}</th>)}</tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}><td>{d.day}</td>{metrics.map((m) => <td key={m.key} className="text-right">{fmt(m, Number(d[m.key] ?? 0))}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
