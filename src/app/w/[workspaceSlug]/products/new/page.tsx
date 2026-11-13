import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listPeople } from "@/modules/identity/service";
import { listGroups, productOptions } from "@/modules/portfolio/service";
import { createProductAction } from "@/modules/portfolio/actions";
import { ProductForm } from "@/components/client/product-form";
import { NoAccess, PageHeader } from "@/components/ui";

export const metadata = { title: "New product" };

export default async function NewProductPage({ params }: PageProps<"/w/[workspaceSlug]/products/new">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "product.create")) return <NoAccess what="product creation" />;
  const [people, groups, products] = await Promise.all([listPeople(ctx), listGroups(ctx), productOptions(ctx)]);
  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Add a product" description="Anything you run counts: a SaaS, a website, an API, a client project, an idea you're validating." />
      <div className="panel p-5 sm:p-7">
        <ProductForm action={createProductAction.bind(null, ctx.workspaceSlug)} people={people} groups={groups} products={products} submitLabel="Create product" />
      </div>
    </>
  );
}
