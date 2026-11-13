import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { getTask } from "@/modules/work/service";
import { listPeople } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { listActivity } from "@/modules/audit/service";
import { TaskDetail } from "@/components/client/task-detail";
import { NoAccess } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/w/[workspaceSlug]/work/[number]">) {
  const { number } = await params;
  return { title: `Task #${number}` };
}

export default async function TaskPage({ params }: PageProps<"/w/[workspaceSlug]/work/[number]">) {
  const { workspaceSlug, number } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "work.view")) return <NoAccess what="work" />;
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const task = await getTask(ctx, n);
  if (!task) notFound();
  const [people, products, history] = await Promise.all([
    listPeople(ctx),
    productOptions(ctx),
    can(ctx, "audit.view") ? listActivity(ctx, { targetId: task.id, limit: 100 }).then((r) => r.items) : [],
  ]);

  return (
    <>
      <div className="eyebrow mb-3">
        <Link href={`/w/${ctx.workspaceSlug}/work`} className="hover:text-cobalt">Work</Link>
        {task.productSlug && (
          <>
            {" / "}
            <Link href={`/w/${ctx.workspaceSlug}/products/${task.productSlug}/work`} className="hover:text-cobalt">{task.productName}</Link>
          </>
        )}
        {" / "}#{task.number}
      </div>
      <TaskDetail
        slug={ctx.workspaceSlug}
        task={{ ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(), completedAt: task.completedAt?.toISOString() ?? null, comments: task.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })) }}
        people={people}
        products={products}
        history={history.map((h) => ({ id: h.id, actorName: h.actorName, action: h.action, changes: h.changes, createdAt: h.createdAt.toISOString() }))}
        canEdit={can(ctx, "work.edit")}
      />
    </>
  );
}
