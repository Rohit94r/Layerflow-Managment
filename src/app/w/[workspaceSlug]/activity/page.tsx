import Link from "next/link";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listActivity } from "@/modules/audit/service";
import { ActivityList } from "@/components/activity-list";
import { NoAccess, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Activity" };

export default async function ActivityPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/activity">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "audit.view")) return <NoAccess what="the activity log" />;
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
  const { items, hasMore } = await listActivity(ctx, { limit: 50, before });
  const last = items[items.length - 1];
  return (
    <>
      <PageHeader title="Activity" description="Every change in this workspace: who did what, and when. Append-only." />
      <Panel>
        <ActivityList items={items} slug={ctx.workspaceSlug} />
      </Panel>
      <div className="mt-4 flex justify-between">
        {before ? <Link href="?" className="btn btn-ghost btn-sm">Newest</Link> : <span />}
        {hasMore && last && <Link href={`?before=${encodeURIComponent(last.createdAt.toISOString())}`} className="btn btn-secondary btn-sm">Older</Link>}
      </div>
    </>
  );
}
