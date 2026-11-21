import Link from "next/link";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { nextActions, portfolioPulse, change } from "@/modules/growth/service";
import { listAnalyticsProperties } from "@/modules/analytics/service";
import { AgentNudge, Delta, NextActionsPanel, NoAnalytics, PulseTable } from "@/components/growth-views";
import { FreshnessBadge, connectionState } from "@/components/freshness";
import { NoAccess, PageHeader, Panel, Stat } from "@/components/ui";

export const metadata = { title: "Growth" };

export default async function GrowthPage({ params }: PageProps<"/w/[workspaceSlug]/growth">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "product.view")) return <NoAccess what="growth" />;
  const base = `/w/${ctx.workspaceSlug}`;
  const pulse = await portfolioPulse(ctx);
  const [actions, gaProps] = await Promise.all([nextActions(ctx, pulse), can(ctx, "analytics.view") ? listAnalyticsProperties(ctx) : Promise.resolve([])]);

  const sum = (pick: (r: (typeof pulse)[number]) => { current: number; previous: number | null } | null) => {
    const rows = pulse.map(pick).filter((x): x is { current: number; previous: number | null } => Boolean(x));
    if (!rows.length) return null;
    return { current: rows.reduce((s, r) => s + r.current, 0), previous: rows.every((r) => r.previous !== null) ? rows.reduce((s, r) => s + r.previous!, 0) : null };
  };
  const traffic = sum((r) => r.traffic);
  const search = sum((r) => r.search);
  const keyEvents = sum((r) => (r.traffic ? { current: r.traffic.keyEvents, previous: r.traffic.prevKeyEvents } : null));
  const posts = pulse.reduce((s, r) => s + (r.content?.published30d ?? 0), 0);
  const queued = pulse.reduce((s, r) => s + (r.content?.scheduled ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Growth"
        description="Traffic, search, conversions and content for every project, side by side, with what to do next."
        actions={
          <>
            {can(ctx, "seo.view") && <Link href={`${base}/seo`} className="btn btn-secondary">SEO</Link>}
            {can(ctx, "content.view") && <Link href={`${base}/content`} className="btn btn-primary">Content studio</Link>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sessions · 28d" value={traffic ? traffic.current.toLocaleString("en-US") : "—"} hint={traffic ? <Delta value={change(traffic)} /> : "Connect Google Analytics"} />
        <Stat label="Key events · 28d" value={keyEvents ? keyEvents.current.toLocaleString("en-US") : "—"} hint={keyEvents ? <Delta value={change(keyEvents)} /> : "From GA4 key events"} />
        <Stat label="Search clicks · 28d" value={search ? search.current.toLocaleString("en-US") : "—"} hint={search ? <Delta value={change(search)} /> : "Connect Search Console"} href={can(ctx, "seo.view") ? `${base}/seo` : undefined} />
        <Stat label="Posts published · 30d" value={can(ctx, "content.view") ? posts : "—"} hint={queued ? `${queued} scheduled` : "Nothing scheduled"} href={can(ctx, "content.view") ? `${base}/content` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Portfolio pulse" action={<span className="text-[12px] text-muted">Last 28 days vs previous 28</span>}>
            <PulseTable slug={ctx.workspaceSlug} rows={pulse} />
            <p className="border-t border-line px-4 py-2 text-[11.5px] text-muted">
              Sessions and key events: Google Analytics 4. Clicks: Google Search Console. “Connect” means no source is mapped. That is not the same as zero.
            </p>
          </Panel>
          {can(ctx, "analytics.view") && !gaProps.length && <NoAnalytics slug={ctx.workspaceSlug} canManage={can(ctx, "integration.manage")} />}
        </div>
        <div className="space-y-6">
          <NextActionsPanel actions={actions} />
          {gaProps.length > 0 && (
            <Panel title="Analytics properties">
              <ul className="divide-y divide-line">
                {gaProps.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{p.productSlug ? <Link className="hover:text-cobalt" href={`${base}/products/${p.productSlug}/growth`}>{p.productName}</Link> : <span className="text-muted">Unmapped</span>}<span className="text-muted"> · {p.name}</span></span>
                    <FreshnessBadge state={connectionState(p.connectionStatus, p.lastSyncAt)} at={p.lastSyncAt} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {can(ctx, "agent.view") && <AgentNudge slug={ctx.workspaceSlug} />}
        </div>
      </div>
    </>
  );
}
