import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { loadWork } from "@/server/work-data";
import { listPeople } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { TASK_TYPES, taskLabel } from "@/modules/work/constants";
import { FilterBar } from "@/components/client/filter-bar";
import { NewTaskButton, WorkView } from "@/components/client/work-view";
import { NoAccess } from "@/components/ui";

export default async function ProductWork({ params, searchParams }: PageProps<"/w/[workspaceSlug]/products/[productSlug]/work">) {
  const { workspaceSlug, productSlug } = await params;
  const sp = await searchParams;
  const { ctx, product } = await loadProductPage(workspaceSlug, productSlug);
  if (!can(ctx, "work.view")) return <NoAccess what="work" />;
  const [{ tasks }, people, products] = await Promise.all([loadWork(ctx, sp, product.id), listPeople(ctx), productOptions(ctx)]);
  return (
    <>
      <FilterBar
        searchPlaceholder="Search this project's work"
        fields={[
          { name: "assignee", label: "Assignee", options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))] },
          { name: "type", label: "Type", options: TASK_TYPES.map((t) => ({ value: t, label: taskLabel(t) })) },
        ]}
      >
        {can(ctx, "work.edit") && <NewTaskButton slug={ctx.workspaceSlug} products={products} people={people} defaultProductId={product.id} />}
      </FilterBar>
      <WorkView slug={ctx.workspaceSlug} tasks={tasks} people={people} canEdit={can(ctx, "work.edit")} showProduct={false} />
    </>
  );
}
