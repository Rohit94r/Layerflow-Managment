import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { FinanceView } from "@/components/finance-view";
import { NoAccess } from "@/components/ui";

export default async function ProductFinance({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/finance">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "finance.view")) return <NoAccess what="finance" />;
  return <FinanceView ctx={ctx} productId={product.id} currency={ctx.workspace.currency} />;
}
