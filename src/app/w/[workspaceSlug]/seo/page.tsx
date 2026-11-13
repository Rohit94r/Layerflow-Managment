import Link from "next/link";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listInsights, listProperties } from "@/modules/seo/service";
import { InsightList, PropertyPerformance } from "@/components/seo-views";
import { FreshnessBadge, connectionState } from "@/components/freshness";
import { EmptyState, NoAccess, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "SEO" };

export default async function SeoPage({ params }: PageProps<"/w/[workspaceSlug]/seo">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "seo.view")) return <NoAccess what="SEO" />;
  const [props, insights] = await Promise.all([listProperties(ctx), listInsights(ctx)]);
  const mapped = props.filter((p) => p.productId);

  return (
    <>
      <PageHeader
        title="SEO"
        description="Search performance from Google Search Console across your products, with evidence-backed opportunities you can turn into tasks. Technical audits and uptime live on each product's SEO tab."
        actions={can(ctx, "integration.view") ? <Link href={`/w/${ctx.workspaceSlug}/integrations`} className="btn btn-secondary">Manage connection</Link> : undefined}
      />
      {!props.length ? (
        <div className="panel">
          <EmptyState
            title="Search Console isn't connected"
            action={can(ctx, "integration.manage") ? <Link href={`/w/${ctx.workspaceSlug}/integrations`} className="btn btn-primary">Connect Google Search Console</Link> : undefined}
          >
            Connect read-only Search Console access, map each property to a product, and this page fills with clicks, impressions, CTR, rankings and opportunities.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-6">
          {props.length > mapped.length && (
            <p className="rounded-md border border-warn/40 bg-warn-soft/60 px-4 py-2.5 text-[13px] text-warn">
              {props.length - mapped.length} propert{props.length - mapped.length === 1 ? "y is" : "ies are"} not mapped to a product and won&apos;t be synced.{" "}
              <Link href={`/w/${ctx.workspaceSlug}/integrations`} className="underline">Map them</Link>
            </p>
          )}
          <Panel title="Opportunities" action={<span className="text-[12px] text-muted">{insights.length} open</span>}>
            <InsightList ctx={ctx} insights={insights} showProduct />
          </Panel>
          {mapped.map((p) => (
            <div key={p.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Link href={`/w/${ctx.workspaceSlug}/products/${p.productSlug}/seo`} className="font-serif text-lg hover:text-cobalt">{p.productName}</Link>
                <span className="font-mono text-muted">{p.siteUrl}</span>
                <FreshnessBadge state={connectionState(p.connectionStatus, p.lastSyncAt)} at={p.lastSyncAt} />
              </div>
              <PropertyPerformance ctx={ctx} resourceId={p.id} title="Search performance" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
