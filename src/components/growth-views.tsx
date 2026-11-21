import Link from "next/link";
import { ArrowRight, Bot, CheckCheck, CircleDollarSign, FileText, ListChecks, Plug, Search, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import type { Ctx } from "@/server/permissions";
import { analyticsOverview } from "@/modules/analytics/service";
import { change, type NextAction, type PulseRow } from "@/modules/growth/service";
import { SeriesChart } from "@/components/client/series-chart";
import { Badge, EmptyState, HealthBadge, Panel, ProductMark, SourceNote } from "@/components/ui";
import { cn, formatDate, relativeTime } from "@/lib/format";

/** Percentage change badge. null means "no comparable period", shown as a dash, never as 0%. */
export function Delta({ value, className }: { value: number | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-[12px] text-muted", className)} title="No comparable previous period">—</span>;
  const pct = Math.round(value * 100);
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums", pct > 0 ? "text-good" : pct < 0 ? "text-bad" : "text-muted", className)}>
      <Icon className="size-3" aria-hidden />{pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}

const ratio = (cur: number, prev: number | null | undefined) => (prev ? (cur - prev) / prev : null);

/* ---------------- Next best actions ---------------- */

const CAT_ICON = { approval: CheckCheck, work: ListChecks, content: FileText, growth: TrendingDown, seo: Search, integration: Plug, finance: CircleDollarSign, product: TriangleAlert } as const;
const SEV_DOT = { critical: "bg-bad", high: "bg-warn", medium: "bg-cobalt", low: "bg-muted" } as const;

export function NextActionsPanel({ actions, title = "Next best actions" }: { actions: NextAction[]; title?: string }) {
  return (
    <Panel title={title} action={<span className="hidden text-[12px] text-muted sm:inline">By severity</span>}>
      {actions.length ? (
        <ul className="divide-y divide-line">
          {actions.map((a) => {
            const Icon = CAT_ICON[a.category];
            return (
              <li key={a.id}>
                <Link href={a.href} className="group flex items-start gap-3 px-4 py-3 hover:bg-sunken/60">
                  <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-bg">
                    <Icon className="size-3.5 text-ink-2" aria-hidden />
                    <span className={cn("absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-surface", SEV_DOT[a.severity])} aria-label={`${a.severity} priority`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{a.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{a.detail}</div>
                  </div>
                  <span className="hidden shrink-0 items-center gap-1 self-center text-[12.5px] text-cobalt sm:flex">{a.cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title="You're clear">No approvals, overdue work, traffic drops or stalled content right now.</EmptyState>
      )}
    </Panel>
  );
}

/* ---------------- Portfolio pulse ---------------- */

function Metric({ label, value, delta, empty }: { label: string; value?: string; delta?: number | null; empty: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted">{label}</div>
      {value !== undefined ? (
        <div className="flex items-baseline gap-1.5"><span className="tabular-nums">{value}</span>{delta !== undefined && <Delta value={delta} />}</div>
      ) : (
        <div className="text-[12px] text-muted">{empty}</div>
      )}
    </div>
  );
}

/** Every product on one screen: delivery, search, traffic and content. Stacked cards on phones. */
export function PulseTable({ slug, rows }: { slug: string; rows: PulseRow[] }) {
  if (!rows.length) return <EmptyState compact title="No projects yet">Add projects to see their pulse side by side.</EmptyState>;
  const base = `/w/${slug}/products`;
  return (
    <>
      <ul className="divide-y divide-line lg:hidden">
        {rows.map((r) => (
          <li key={r.product.id}>
            <Link href={`${base}/${r.product.slug}`} className="block px-4 py-3 active:bg-sunken">
              <div className="flex items-center gap-2.5">
                <ProductMark name={r.product.name} color={r.product.brandColor} className="size-6 text-[11px]" />
                <span className="min-w-0 flex-1 truncate font-medium">{r.product.name}</span>
                <HealthBadge health={r.product.health} />
              </div>
              {r.topSignal && <div className="mt-1 truncate pl-8 text-[12px] text-warn">{r.topSignal}</div>}
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 pl-8 text-[13px] sm:grid-cols-4">
                <Metric label="Work" value={`${r.openTasks} open${r.overdueTasks ? ` · ${r.overdueTasks} late` : ""}`} empty="—" />
                <Metric label="Search clicks · 28d" value={r.search?.current.toLocaleString("en-US")} delta={r.search ? change(r.search) : undefined} empty="Not connected" />
                <Metric label="Sessions · 28d" value={r.traffic?.current.toLocaleString("en-US")} delta={r.traffic ? change(r.traffic) : undefined} empty="Not connected" />
                <Metric label="Posts · 30d" value={r.content ? `${r.content.published30d}${r.content.scheduled ? ` · ${r.content.scheduled} queued` : ""}` : undefined} empty="—" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto lg:block">
        <table className="table">
          <thead>
            <tr>
              <th>Project</th><th>Health</th><th className="text-right" title="Open tasks / overdue">Tasks</th>
              <th className="text-right" title="Google Search Console clicks, last 28 days">Clicks</th><th className="text-right" title="Google Analytics sessions, last 28 days">Sessions</th>
              <th className="text-right" title="GA4 key events, last 28 days">Key ev.</th><th className="text-right" title="Posts published in the last 30 days">Posts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product.id}>
                <td className="max-w-[220px]">
                  <Link href={`${base}/${r.product.slug}`} className="flex items-center gap-2.5 hover:text-cobalt">
                    <ProductMark name={r.product.name} color={r.product.brandColor} className="size-6 text-[11px]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.product.name}</span>
                      {r.topSignal && <span className="block truncate text-[11.5px] text-warn">{r.topSignal}</span>}
                    </span>
                  </Link>
                </td>
                <td><HealthBadge health={r.product.health} /></td>
                <td className="text-right tabular-nums">{r.openTasks}{r.overdueTasks ? <span className="text-bad"> / {r.overdueTasks}</span> : <span className="text-muted"> / 0</span>}</td>
                <td className="text-right">
                  {r.search ? <span className="inline-flex items-baseline gap-1.5 tabular-nums">{r.search.current.toLocaleString("en-US")} <Delta value={change(r.search)} /></span> : <Link href={`/w/${slug}/integrations`} className="text-[12px] text-muted hover:text-cobalt">Connect</Link>}
                </td>
                <td className="text-right">
                  {r.traffic ? <span className="inline-flex items-baseline gap-1.5 tabular-nums">{r.traffic.current.toLocaleString("en-US")} <Delta value={change(r.traffic)} /></span> : <Link href={`/w/${slug}/integrations`} className="text-[12px] text-muted hover:text-cobalt">Connect</Link>}
                </td>
                <td className="text-right">
                  {r.traffic ? <span className="inline-flex items-baseline gap-1.5 tabular-nums">{r.traffic.keyEvents.toLocaleString("en-US")} <Delta value={ratio(r.traffic.keyEvents, r.traffic.prevKeyEvents)} /></span> : <span className="text-muted">—</span>}
                </td>
                <td className="text-right tabular-nums">
                  {r.content ? (
                    <Link href={`/w/${slug}/content?product=${r.product.slug}`} className="hover:text-cobalt" title={r.content.lastPublishedAt ? `Last published ${relativeTime(r.content.lastPublishedAt)}` : "Never published"}>
                      {r.content.published30d}{r.content.scheduled ? <span className="text-cobalt"> +{r.content.scheduled}</span> : null}{r.content.inReview ? <span className="text-warn"> · {r.content.inReview} review</span> : null}
                    </Link>
                  ) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- GA4 property performance ---------------- */

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export async function AnalyticsPerformance({ ctx, resourceId, title = "Traffic" }: { ctx: Ctx; resourceId: string; title?: string }) {
  const o = await analyticsOverview(ctx, resourceId);
  if (!o.current) {
    return (
      <Panel title={title}>
        <EmptyState compact title="No analytics data yet">The first sync runs after you map this property to a project. Data appears once Google returns it.</EmptyState>
      </Panel>
    );
  }
  const c = o.current;
  const p = o.previous;
  const kpis = [
    { label: "Sessions", v: c.sessions.toLocaleString("en-US"), d: ratio(c.sessions, p?.sessions) },
    { label: "Users (daily, summed)", v: c.users.toLocaleString("en-US"), d: ratio(c.users, p?.users) },
    { label: "Key events", v: c.keyEvents.toLocaleString("en-US"), d: ratio(c.keyEvents, p?.keyEvents) },
    { label: "Engagement rate", v: fmtPct(c.engagementRate), d: p ? (c.engagementRate - p.engagementRate) / (p.engagementRate || 1) : null },
  ];
  return (
    <div className="space-y-6">
      <Panel title={title} action={<span className="text-[12px] text-muted">{formatDate(c.from, { month: "short", day: "numeric" })} – {formatDate(c.to, { month: "short", day: "numeric" })} vs previous 28 days</span>}>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="bg-surface px-4 py-3">
              <div className="eyebrow">{k.label}</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="font-serif text-[1.6rem] leading-none tabular-nums">{k.v}</span><Delta value={k.d} /></div>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-4">
          <SeriesChart
            data={o.daily.map((d) => ({ ...d, engagementRate: d.sessions ? d.engagedSessions / d.sessions : 0 }))}
            metrics={[{ key: "sessions", label: "Sessions" }, { key: "users", label: "Users" }, { key: "keyEvents", label: "Key events" }, { key: "pageViews", label: "Page views" }, { key: "engagementRate", label: "Engagement", format: "pct" }]}
            source="Google Analytics 4"
          />
          <SourceNote>Source: Google Analytics 4 Data API · aggregated, no user-level data · the latest 1–2 days may still be processing.</SourceNote>
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BreakdownTable title="Channels" rows={o.channels} />
        <BreakdownTable title="Landing pages" rows={o.landingPages} mono />
      </div>
    </div>
  );
}

function BreakdownTable({ title, rows, mono }: { title: string; rows: { key: string; sessions: number; keyEvents: number; engagementRate: number; prevSessions: number | null }[]; mono?: boolean }) {
  return (
    <Panel title={title} action={<span className="text-[12px] text-muted">Last 28 days</span>}>
      {rows.length ? (
        <div className="max-h-[420px] overflow-auto">
          <table className="table">
            <thead><tr><th>{title === "Channels" ? "Channel" : "Page"}</th><th className="text-right">Sessions</th><th className="text-right">Change</th><th className="text-right">Key ev.</th></tr></thead>
            <tbody>
              {rows.slice(0, 25).map((r) => (
                <tr key={r.key}>
                  <td className={cn("max-w-[240px] truncate", mono && "font-mono text-[12px]")} title={r.key}>{r.key}</td>
                  <td className="text-right tabular-nums">{r.sessions.toLocaleString("en-US")}</td>
                  <td className="text-right"><Delta value={r.prevSessions === null ? null : ratio(r.sessions, r.prevSessions)} /></td>
                  <td className="text-right tabular-nums">{r.keyEvents.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-[13px] text-muted">No rows for this period.</p>
      )}
    </Panel>
  );
}

export function NoAnalytics({ slug, canManage }: { slug: string; canManage: boolean }) {
  return (
    <div className="panel">
      <EmptyState
        title="Google Analytics isn't connected"
        action={canManage ? <Link href={`/w/${slug}/integrations`} className="btn btn-primary">Connect Google Analytics</Link> : undefined}
      >
        Connect read-only GA4 access and map each property to a project to see sessions, key events, channels and landing pages here, and to get traffic-drop alerts.
      </EmptyState>
    </div>
  );
}

export function AgentNudge({ slug }: { slug: string }) {
  return (
    <Link href={`/w/${slug}/agents`} className="panel flex items-center gap-3 p-4 hover:border-cobalt">
      <Bot className="size-5 shrink-0 text-cobalt" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Put growth on a schedule</div>
        <div className="text-[12.5px] text-muted">Install the Growth Analyst for a weekly review, and a Content Writer per project for a steady stream of SEO drafts.</div>
      </div>
      <Badge tone="cobalt">Agents</Badge>
    </Link>
  );
}
