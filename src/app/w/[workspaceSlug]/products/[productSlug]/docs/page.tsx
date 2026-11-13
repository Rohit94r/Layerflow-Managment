import Link from "next/link";
import { Plus } from "lucide-react";
import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listDocs } from "@/modules/knowledge/service";
import { DocList } from "@/components/doc-list";
import { NoAccess } from "@/components/ui";

export default async function ProductDocs({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/docs">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "docs.view")) return <NoAccess what="documents" />;
  const docs = await listDocs(ctx, { productId: product.id });
  const newLink = can(ctx, "docs.edit") ? (
    <Link href={`/w/${ctx.workspaceSlug}/docs/new?product=${product.id}`} className="btn btn-primary"><Plus className="size-4" /> New document</Link>
  ) : null;
  return (
    <>
      {docs.length > 0 && <div className="mb-4 flex justify-end">{newLink}</div>}
      <DocList slug={ctx.workspaceSlug} docs={docs} emptyAction={newLink} showProduct={false} />
    </>
  );
}
