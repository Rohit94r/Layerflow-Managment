import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { loadWork } from "@/server/work-data";
import { listPeople } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { TASK_STATUSES, TASK_TYPES, taskLabel } from "@/modules/work/constants";
import { FilterBar } from "@/components/client/filter-bar";
import { NewTaskButton, WorkView } from "@/components/client/work-view";
import { NoAccess, PageHeader } from "@/components/ui";

export const metadata = { title: "Work" };

export default async function WorkPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/work">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "work.view")) return <NoAccess what="work" />;
  const [{ layout, tasks }, people, products] = await Promise.all([loadWork(ctx, sp), listPeople(ctx), productOptions(ctx)]);

  return (
    <>
      <PageHeader
        title="Work"
        description="Tasks and bugs across every project."
        actions={can(ctx, "work.edit") && <NewTaskButton slug={ctx.workspaceSlug} products={products} people={people} autoOpen={sp.new === "1"} />}
      />
      <FilterBar
        searchPlaceholder="Search title or #number"
        fields={[
          { name: "product", label: "Product", options: products.map((p) => ({ value: p.id, label: p.name })) },
          { name: "assignee", label: "Assignee", options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))] },
          { name: "type", label: "Type", options: TASK_TYPES.map((t) => ({ value: t, label: taskLabel(t) })) },
          { name: "overdue", label: "Any due date", options: [{ value: "1", label: "Overdue only" }] },
          ...(layout === "list"
            ? [{ name: "status", label: "Open", options: [{ value: "all", label: "All statuses" }, ...TASK_STATUSES.map((s) => ({ value: s, label: taskLabel(s) }))] }]
            : []),
        ]}
      />
      <WorkView slug={ctx.workspaceSlug} tasks={tasks} people={people} canEdit={can(ctx, "work.edit")} />
    </>
  );
}
