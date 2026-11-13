"use client";

import { useMemo, useState } from "react";
import { cn, formatDate } from "@/lib/format";

type Point = { day: string; clicks: number; impressions: number; ctr: number; position: number };
type Metric = "clicks" | "impressions" | "ctr" | "position";

const LABEL: Record<Metric, string> = { clicks: "Clicks", impressions: "Impressions", ctr: "CTR", position: "Avg. position" };
const fmt = (m: Metric, v: number) =>
  m === "ctr" ? `${(v * 100).toFixed(1)}%` : m === "position" ? v.toFixed(1) : Math.round(v).toLocaleString("en-US");

/**
 * Single-series daily trend. One metric at a time (never two y-axes); crosshair + tooltip on hover;
 * keyboard-reachable; a table view for screen readers and exact values.
 */
export function TrendChart({ data }: { data: Point[] }) {
  const [metric, setMetric] = useState<Metric>("clicks");
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const P = { l: 44, r: 12, t: 12, b: 26 };
  const values = data.map((d) => d[metric]);
  const invert = metric === "position"; // lower position is better: draw it upside down so "up" means better
  const { max, min, path, area, xs, ys } = useMemo(() => {
    const mx = Math.max(...values, metric === "ctr" ? 0.01 : 1);
    const mn = metric === "position" ? Math.max(0, Math.min(...values) - 1) : 0;
    const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1);
    const y = (v: number) => {
      const t = (v - mn) / (mx - mn || 1);
      return invert ? P.t + t * (H - P.t - P.b) : H - P.b - t * (H - P.t - P.b);
    };
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    const a = `${d}L${x(values.length - 1).toFixed(1)},${H - P.b}L${P.l},${H - P.b}Z`;
    return { max: mx, min: mn, path: d, area: a, xs: pts.map((p) => p[0]), ys: pts.map((p) => p[1]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, metric]);

  if (!data.length) return null;
  const ticks = [0, 0.5, 1].map((t) => min + t * (max - min));
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Metric">
        {(Object.keys(LABEL) as Metric[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={metric === m}
            onClick={() => setMetric(m)}
            className={cn("rounded-md px-2.5 py-1 text-[12.5px]", metric === m ? "bg-ink text-bg" : "text-ink-2 hover:bg-sunken")}
          >
            {LABEL[m]}
          </button>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Daily ${LABEL[metric]} from ${data[0]!.day} to ${data.at(-1)!.day}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i]! - px) < Math.abs(xs[best]! - px)) best = i;
            setHover(best);
          }}
        >
          {ticks.map((t) => {
            const y = invert ? P.t + ((t - min) / (max - min || 1)) * (H - P.t - P.b) : H - P.b - ((t - min) / (max - min || 1)) * (H - P.t - P.b);
            return (
              <g key={t}>
                <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
                <text x={P.l - 6} y={y + 4} textAnchor="end" className="fill-muted text-[10.5px] tabular-nums">{fmt(metric, t)}</text>
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
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] shadow-float"
            style={{ left: `${(xs[hover]! / W) * 100}%` }}
          >
            <div className="font-medium text-ink">{formatDate(h.day, { weekday: "short", month: "short", day: "numeric" })}</div>
            <div className="tabular-nums text-ink-2">{h.clicks.toLocaleString()} clicks · {h.impressions.toLocaleString()} impr.</div>
            <div className="tabular-nums text-muted">CTR {(h.ctr * 100).toFixed(1)}% · pos. {h.position.toFixed(1)}</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-[12.5px]">
        <summary className="cursor-pointer text-muted">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="table">
            <thead><tr><th>Date</th><th className="text-right">Clicks</th><th className="text-right">Impressions</th><th className="text-right">CTR</th><th className="text-right">Position</th></tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td className="text-right">{d.clicks.toLocaleString()}</td>
                  <td className="text-right">{d.impressions.toLocaleString()}</td>
                  <td className="text-right">{(d.ctr * 100).toFixed(1)}%</td>
                  <td className="text-right">{d.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
