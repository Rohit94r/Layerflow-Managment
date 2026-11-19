import Link from "next/link";
import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listAnalyticsProperties } from "@/modules/analytics/service";
import { nextActions, portfolioPulse, change } from "@/modules/growth/service";
import { AnalyticsPerformance, Delta, NextActionsPanel, NoAnalytics } from "@/components/growth-views";
import { FreshnessBadge, connectionState } from "@/components/freshness";
import { NoAccess, Panel, Stat } from "@/components/ui";
import { relativeTime } from "@/lib/format";

export default async function ProductGrowth({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/growth">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product, base } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "analytics.view") && !can(ctx, "seo.view") && !can(ctx, "content.view")) return <NoAccess what="growth" />;
  const pulse = await portfolioPulse(ctx);
  const row = pulse.find((r) => r.product.id === product.id);
  const [props, actions] = await Promise.all([
    can(ctx, "analytics.view") ? listAnalyticsProperties(ctx, product.id) : Promise.resolve([]),
    nextActions(ctx, row ? [row] : []),
  ]);
  const mine = actions.filter((a) => a.product?.name === product.name || a.id.endsWith(product.id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sessions · 28d" value={row?.traffic ? row.traffic.current.toLocaleString("en-US") : "—"} hint={row?.traffic ? <Delta value={change(row.traffic)} /> : "Not connected"} />
        <Stat label="Key events · 28d" value={row?.traffic ? row.traffic.keyEvents.toLocaleString("en-US") : "—"} hint={row?.traffic ? <Delta value={change({ current: row.traffic.keyEvents, previous: row.traffic.prevKeyEvents })} /> : "Not connected"} />
        <Stat label="Search clicks · 28d" value={row?.search ? row.search.current.toLocaleString("en-US") : "—"} hint={row?.search ? <Delta value={change(row.search)} /> : "Not connected"} href={`${base}/seo`} />
        <Stat
          label="Posts · 30d"
          value={row?.content ? row.content.published30d : "—"}
          hint={row?.content?.lastPublishedAt ? `Last ${relativeTime(row.content.lastPublishedAt)}` : row?.content ? "Nothing published yet" : undefined}
          href={`${base}/content`}
        />
      </div>

      {mine.length > 0 && <NextActionsPanel actions={mine} title="What to do next" />}

      {can(ctx, "analytics.view") && (
        props.filter((p) => p.dataThrough).length ? (
          props.filter((p) => p.dataThrough).map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-ink-2">{p.name}</span>
                <FreshnessBadge state={connectionState(p.connectionStatus, p.lastSyncAt)} at={p.lastSyncAt} />
                {p.connectionError && p.connectionStatus !== "active" && <span className="text-bad">{p.connectionError}</span>}
              </div>
              <AnalyticsPerformance ctx={ctx} resourceId={p.id} />
            </div>
          ))
        ) : props.length ? (
          <Panel title="Traffic"><p className="px-4 py-5 text-[13px] text-muted">A Google Analytics property is mapped but hasn&apos;t synced yet. Run a sync from <Link className="link" href={`/w/${ctx.workspaceSlug}/integrations`}>Integrations</Link>.</p></Panel>
        ) : (
          <NoAnalytics slug={ctx.workspaceSlug} canManage={can(ctx, "integration.manage")} />
        )
      )}
    </div>
  );
}
