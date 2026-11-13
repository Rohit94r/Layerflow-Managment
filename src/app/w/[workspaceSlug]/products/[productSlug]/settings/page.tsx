import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listPeople } from "@/modules/identity/service";
import { listGroups, productOptions } from "@/modules/portfolio/service";
import { deleteProductAction, setArchivedAction, updateProductAction } from "@/modules/portfolio/actions";
import { ProductForm } from "@/components/client/product-form";
import { ActionButton, ConfirmButton } from "@/components/client/forms";
import { NoAccess, Panel } from "@/components/ui";

export default async function ProductSettings({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/settings">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product: p } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "product.edit")) return <NoAccess what="product settings" />;
  const [people, groups, products] = await Promise.all([listPeople(ctx), listGroups(ctx), productOptions(ctx)]);
  const slug = ctx.workspaceSlug;

  return (
    <div className="space-y-6">
      <div className="panel p-5 sm:p-7">
        <ProductForm
          action={updateProductAction.bind(null, slug, p.id)}
          values={p}
          people={people}
          groups={groups}
          products={products.filter((x) => x.id !== p.id)}
          submitLabel="Save changes"
        />
      </div>

      {can(ctx, "product.archive") && (
        <Panel title="Danger zone" className="border-bad/40">
          <div className="divide-y divide-line">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="font-medium">{p.archivedAt ? "Restore product" : "Archive product"}</div>
                <p className="text-[13px] text-muted">
                  {p.archivedAt ? "Bring it back into the portfolio and command center." : "Hide it from the portfolio. Tasks, docs and history are kept and it can be restored."}
                </p>
              </div>
              {p.archivedAt ? (
                <ActionButton onClick={setArchivedAction.bind(null, slug, p.id, false)} successMessage="Restored.">Restore</ActionButton>
              ) : (
                <ConfirmButton onConfirm={setArchivedAction.bind(null, slug, p.id, true)} successMessage="Archived.">Archive</ConfirmButton>
              )}
            </div>
            {can(ctx, "product.delete") && (
              <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="font-medium">Delete permanently</div>
                  <p className="text-[13px] text-muted">
                    {p.archivedAt
                      ? "Deletes the product and its links. Tasks, docs and costs stay, unlinked from any product. This can't be undone."
                      : "Archive the product first. Deletion is only available for archived products."}
                  </p>
                </div>
                {p.archivedAt && (
                  <ConfirmButton onConfirm={deleteProductAction.bind(null, slug, p.id)} className="btn btn-danger btn-sm" confirmLabel="Delete forever?">
                    Delete
                  </ConfirmButton>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
