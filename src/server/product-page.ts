import { cache } from "react";
import { notFound } from "next/navigation";
import { getWorkspaceCtx } from "./context";
import { can } from "./permissions";
import { getProductBySlug } from "../modules/portfolio/service";

/** Shared loader for every product sub-page. Cached per request. */
export const loadProductPage = cache(async (workspaceSlug: string, productSlug: string) => {
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "product.view")) notFound();
  const product = await getProductBySlug(ctx, decodeURIComponent(productSlug));
  if (!product) notFound();
  return { ctx, product, base: `/w/${ctx.workspaceSlug}/products/${product.slug}` };
});
