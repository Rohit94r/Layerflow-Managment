import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { RoadmapView } from "@/components/roadmap-view";
import { NoAccess } from "@/components/ui";

export default async function ProductRoadmap({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/roadmap">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "planning.view")) return <NoAccess what="the roadmap" />;
  return <RoadmapView ctx={ctx} productId={product.id} />;
}
