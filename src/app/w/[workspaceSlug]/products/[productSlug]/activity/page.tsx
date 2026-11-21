import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listActivity } from "@/modules/audit/service";
import { ActivityList } from "@/components/activity-list";
import { NoAccess, Panel } from "@/components/ui";

export default async function ProductActivity({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/activity">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "audit.view")) return <NoAccess what="the activity log" />;
  const { items } = await listActivity(ctx, { productId: product.id, limit: 100 });
  return (
    <Panel>
      <ActivityList items={items} slug={ctx.workspaceSlug} emptyText="No activity for this project yet." />
    </Panel>
  );
}
