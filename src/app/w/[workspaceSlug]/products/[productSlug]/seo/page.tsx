import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listInsights, listProperties } from "@/modules/seo/service";
import { InsightList, NoSearchConsole, PropertyPerformance, TechnicalAudit, UptimePanel } from "@/components/seo-views";
import { FreshnessBadge, connectionState } from "@/components/freshness";
import { NoAccess, Panel } from "@/components/ui";

export default async function ProductSeo({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/seo">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "seo.view")) return <NoAccess what="SEO" />;
  const [props, insights] = await Promise.all([listProperties(ctx, product.id), listInsights(ctx, { productId: product.id })]);
  const hasSite = product.links.some((l) => l.kind === "domain" || l.kind === "app");

  return (
    <div className="space-y-6">
      {props.length ? (
        props.map((p) => (
          <div key={p.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-mono">{p.siteUrl}</span>
              <FreshnessBadge state={connectionState(p.connectionStatus, p.lastSyncAt)} at={p.lastSyncAt} />
              {p.connectionError && p.connectionStatus !== "active" && <span className="text-bad">{p.connectionError}</span>}
            </div>
            <PropertyPerformance ctx={ctx} resourceId={p.id} title="Search performance" />
          </div>
        ))
      ) : (
        <NoSearchConsole slug={ctx.workspaceSlug} canManage={can(ctx, "integration.manage")} />
      )}
      <Panel title="SEO opportunities" action={<span className="text-[12px] text-muted">{insights.length} open · rule-based</span>}>
        <InsightList ctx={ctx} insights={insights} />
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <TechnicalAudit ctx={ctx} productId={product.id} hasSite={hasSite} />
        <UptimePanel ctx={ctx} productId={product.id} hasSite={hasSite} />
      </div>
    </div>
  );
}
