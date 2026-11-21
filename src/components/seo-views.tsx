import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Ctx } from "@/server/permissions";
import { can } from "@/server/permissions";
import type { InsightView } from "@/modules/seo/service";
import { latestAudit, propertyOverview, uptimeSummary } from "@/modules/seo/service";
import { InsightActions, RunAuditButton, RunUptimeButton } from "@/components/client/seo-actions";
import { TrendChart } from "@/components/client/trend-chart";
import { Badge, EmptyState, Panel, SourceNote } from "@/components/ui";
import { cn, formatDate, relativeTime } from "@/lib/format";

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Delta({ cur, prev, invert, format }: { cur: number; prev: number | undefined; invert?: boolean; format: "pct" | "abs" }) {
  if (prev === undefined || prev === 0) return <span className="text-[12px] text-muted">no prior period</span>;
  const change = format === "pct" ? (cur - prev) / prev : cur - prev;
  const good = invert ? change < 0 : change > 0;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  if (Math.abs(change) < 0.005) return <span className="text-[12px] text-muted">flat vs prev. 28d</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[12px]", good ? "text-good" : "text-bad")}>
      <Icon className="size-3.5" aria-hidden />
      {format === "pct" ? `${Math.abs(change * 100).toFixed(0)}%` : Math.abs(change).toFixed(1)}
      <span className="text-muted"> vs prev. 28d</span>
    </span>
  );
}

/** Search Console performance for one property: KPIs with period + source, trend, queries, pages. */
export async function PropertyPerformance({ ctx, resourceId, title }: { ctx: Ctx; resourceId: string; title?: string }) {
  const o = await propertyOverview(ctx, resourceId);
  if (!o.current) {
    return (
      <Panel title={title ?? o.resource.name}>
        <EmptyState compact title="No data synced yet">Run a sync from Integrations. Search Console data typically arrives 2–3 days after the fact.</EmptyState>
      </Panel>
    );
  }
  const c = o.current;
  const p = o.previous;
  const kpis = [
    { label: "Clicks", value: n(c.clicks), d: <Delta cur={c.clicks} prev={p?.clicks} format="pct" /> },
    { label: "Impressions", value: n(c.impressions), d: <Delta cur={c.impressions} prev={p?.impressions} format="pct" /> },
    { label: "CTR", value: pct(c.ctr), d: <Delta cur={c.ctr} prev={p?.ctr} format="pct" /> },
    { label: "Avg. position", value: c.position.toFixed(1), d: <Delta cur={c.position} prev={p?.position} invert format="abs" /> },
  ];
  return (
    <Panel title={title ?? o.resource.name} action={<span className="text-[12px] text-muted">{formatDate(c.from, { month: "short", day: "numeric" })} – {formatDate(c.to)}</span>}>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-surface px-4 py-3">
            <div className="eyebrow">{k.label}</div>
            <div className="mt-1 font-serif text-[1.6rem] leading-none tabular-nums">{k.value}</div>
            <div className="mt-1.5">{k.d}</div>
          </div>
        ))}
      </div>
      <div className="p-4">
        <TrendChart data={o.daily} />
        <SourceNote>
          Source: Google Search Console (web search) · last 28 days with data vs the 28 days before · {c.days} of 28 days present · times in Pacific Time (Google&apos;s reporting zone) · synced {o.resource.lastSyncAt ? relativeTime(o.resource.lastSyncAt) : "—"}.
        </SourceNote>
      </div>
      <div className="grid gap-px border-t border-line bg-line lg:grid-cols-2">
        {([["Top queries", o.queries], ["Top pages", o.pages]] as const).map(([label, rows]) => (
          <div key={label} className="bg-surface">
            <div className="eyebrow px-4 pb-1 pt-3">{label}</div>
            <div className="max-h-[360px] overflow-auto">
              <table className="table">
                <thead><tr><th>{label === "Top queries" ? "Query" : "Page"}</th><th className="text-right">Clicks</th><th className="text-right">Impr.</th><th className="text-right">CTR</th><th className="text-right">Pos.</th></tr></thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.key}>
                      <td className="max-w-[260px] truncate text-[13px]" title={r.key}>{label === "Top pages" ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key}</td>
                      <td className="text-right text-[13px]">
                        {n(r.clicks)}
                        {r.prevClicks !== null && r.prevClicks > 0 && Math.abs(r.clicks - r.prevClicks) / r.prevClicks >= 0.2 && (
                          <span className={cn("ml-1 text-[11px]", r.clicks > r.prevClicks ? "text-good" : "text-bad")}>
                            {r.clicks > r.prevClicks ? "▲" : "▼"}
                          </span>
                        )}
                      </td>
                      <td className="text-right text-[13px]">{n(r.impressions)}</td>
                      <td className="text-right text-[13px]">{pct(r.ctr)}</td>
                      <td className="text-right text-[13px]">{r.position.toFixed(1)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={5} className="text-center text-muted">No rows.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {(o.devices.length > 0 || o.countries.length > 0) && (
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line px-4 py-3 text-[12.5px]">
          <div><span className="text-muted">Devices: </span>{o.devices.map((d) => `${d.key.toLowerCase()} ${n(d.clicks)}`).join(" · ")}</div>
          <div><span className="text-muted">Top countries: </span>{o.countries.slice(0, 6).map((d) => `${d.key.toUpperCase()} ${n(d.clicks)}`).join(" · ")}</div>
        </div>
      )}
    </Panel>
  );
}

const KIND_LABEL: Record<string, string> = {
  low_ctr: "Low CTR", striking_distance: "Striking distance", declining_page: "Declining page", declining_query: "Declining query", technical: "Technical",
};

export function InsightList({ ctx, insights, showProduct }: { ctx: Ctx; insights: InsightView[]; showProduct?: boolean }) {
  if (!insights.length) {
    return <p className="px-4 py-5 text-[13px] text-muted">No open opportunities. Insights appear after a sync when the evidence crosses a rule&apos;s threshold.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {insights.map((i) => (
        <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={i.kind.startsWith("declining") ? "warn" : "cobalt"}>{KIND_LABEL[i.kind] ?? i.kind}</Badge>
              <Badge tone="outline">{i.confidence} confidence</Badge>
              {showProduct && i.productName && <span className="text-[12px] text-muted">{i.productName}</span>}
            </div>
            <div className="mt-1 font-medium">{i.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-2">
              {Object.entries(i.evidence).filter(([k]) => k !== "period").map(([k, v]) => (
                <span key={k}><span className="text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}:</span> {v}</span>
              ))}
            </div>
            <div className="mt-1 text-[12.5px] text-ink-2"><span className="text-muted">Next:</span> {i.nextAction}</div>
            <div className="mt-0.5 text-[11.5px] text-muted">Period: {String(i.evidence.period ?? i.periodLabel)}</div>
          </div>
          {i.status === "open" ? (
            <InsightActions slug={ctx.workspaceSlug} id={i.id} canTask={can(ctx, "work.edit")} canRun={can(ctx, "seo.run")} />
          ) : i.status === "task_created" ? (
            <Badge tone="good">Task created</Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export async function TechnicalAudit({ ctx, productId, hasSite }: { ctx: Ctx; productId: string; hasSite: boolean }) {
  const a = await latestAudit(ctx, productId);
  const canRun = can(ctx, "seo.run") && hasSite;
  const errors = a?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = a?.issues.filter((i) => i.severity === "warning") ?? [];
  const notices = a?.issues.filter((i) => i.severity === "notice") ?? [];
  return (
    <Panel title="Technical audit" action={canRun ? <RunAuditButton slug={ctx.workspaceSlug} productId={productId} label={a ? "Re-run" : "Run audit"} /> : undefined}>
      {!hasSite ? (
        <p className="px-4 py-5 text-[13px] text-muted">Add a Domain or App link on the Overview tab to audit this project&apos;s site.</p>
      ) : !a ? (
        <p className="px-4 py-5 text-[13px] text-muted">No audit yet. The crawler checks up to 25 pages on the same domain, respects robots.txt and waits between requests.</p>
      ) : a.status === "failed" ? (
        <p className="px-4 py-5 text-[13px] text-bad">Audit failed: {a.error}</p>
      ) : a.status === "running" ? (
        <p className="px-4 py-5 text-[13px] text-muted">Audit running…</p>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
            {[["Pages crawled", a.pagesCrawled], ["Errors", errors.length], ["Warnings", warnings.length], ["Notices", notices.length]].map(([l, v]) => (
              <div key={l as string} className="bg-surface px-4 py-3">
                <div className="eyebrow">{l}</div>
                <div className={cn("mt-1 font-serif text-[1.5rem] leading-none", l === "Errors" && Number(v) > 0 && "text-bad")}>{v}</div>
              </div>
            ))}
          </div>
          {a.site && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
              <Badge tone={a.site.https ? "good" : "bad"}>{a.site.https ? "HTTPS" : "No HTTPS"}</Badge>
              <Badge tone={a.site.robotsTxt ? "good" : "outline"}>{a.site.robotsTxt ? "robots.txt" : "No robots.txt"}</Badge>
              <Badge tone={a.site.sitemap ? "good" : "warn"}>{a.site.sitemap ? "Sitemap found" : "No sitemap"}</Badge>
              <Badge tone={a.site.hsts ? "good" : "outline"}>{a.site.hsts ? "HSTS" : "No HSTS"}</Badge>
            </div>
          )}
          <ul className="max-h-[360px] divide-y divide-line overflow-auto">
            {[...errors, ...warnings, ...notices].slice(0, 120).map((i, k) => (
              <li key={k} className="flex items-start gap-3 px-4 py-2 text-[13px]">
                <Badge tone={i.severity === "error" ? "bad" : i.severity === "warning" ? "warn" : "outline"}>{i.severity}</Badge>
                <span className="flex-1">{i.message}</span>
                <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="max-w-[40%] truncate text-[12px] text-muted hover:text-cobalt">{i.url.replace(/^https?:\/\//, "")}</a>
              </li>
            ))}
            {!a.issues.length && <li className="px-4 py-4 text-[13px] text-good">No issues found on the crawled pages.</li>}
          </ul>
          <SourceNote className="px-4">Crawler observations from {relativeTime(a.startedAt)}, starting at {a.startUrl}. These are not Google indexing facts — use Search Console&apos;s URL Inspection for those.</SourceNote>
          <div className="h-3" />
        </div>
      )}
    </Panel>
  );
}

export async function UptimePanel({ ctx, productId, hasSite }: { ctx: Ctx; productId: string; hasSite: boolean }) {
  const rows = await uptimeSummary(ctx, productId);
  return (
    <Panel title="Uptime" action={can(ctx, "seo.run") && hasSite ? <RunUptimeButton slug={ctx.workspaceSlug} productId={productId} /> : undefined}>
      {!rows.length ? (
        <p className="px-4 py-5 text-[13px] text-muted">
          {hasSite ? "No checks yet. Run one now; the scheduler checks every site link automatically when CRON_SECRET is configured." : "Add a Domain or App link to monitor this project."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.url} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.latest.ok ? "good" : "bad"}>{r.latest.ok ? "Up" : "Down"}</Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{r.url}</span>
                <span className="text-[12px] text-muted">
                  {r.availability !== null ? `${(r.availability * 100).toFixed(2)}% of ${r.checks} checks · 30d` : ""}
                  {r.p50 ? ` · median ${r.p50} ms` : ""}
                </span>
              </div>
              <div className="mt-2 flex h-5 gap-[2px]" aria-label="Recent checks, oldest to newest">
                {r.recent.map((c, i) => (
                  <span key={i} title={`${c.ok ? "Up" : "Down"} · ${new Date(c.at).toLocaleString()}`} className={cn("w-1.5 rounded-[2px]", c.ok ? "bg-good/70" : "bg-bad")} />
                ))}
              </div>
              <div className="mt-1.5 text-[12px] text-muted">
                Last check {relativeTime(r.latest.checkedAt)}: {r.latest.ok ? `HTTP ${r.latest.statusCode} in ${r.latest.responseMs} ms` : r.latest.error ?? `HTTP ${r.latest.statusCode}`}
                {r.sslExpiresAt && <> · TLS certificate expires {formatDate(r.sslExpiresAt)}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <SourceNote className="px-4">Checks are real HTTP requests made by this server. Monitoring is only as frequent as the scheduler runs.</SourceNote>
      <div className="h-3" />
    </Panel>
  );
}

export function NoSearchConsole({ slug, canManage }: { slug: string; canManage: boolean }) {
  return (
    <Panel title="Google Search Console">
      <EmptyState compact title="Not connected" action={canManage ? <Link href={`/w/${slug}/integrations`} className="btn btn-primary">Connect Search Console</Link> : undefined}>
        Connect Search Console and map a property to this project to see clicks, impressions, CTR, position, top queries and pages, and evidence-backed opportunities.
      </EmptyState>
    </Panel>
  );
}
