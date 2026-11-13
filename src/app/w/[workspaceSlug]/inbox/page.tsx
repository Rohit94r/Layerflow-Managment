import Link from "next/link";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listInbox } from "@/modules/automation/inbox";
import { ApprovalsPanel } from "@/components/approvals";
import { InboxBulk, InboxButtons } from "@/components/client/ops-actions";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { cn, relativeTime } from "@/lib/format";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ params, searchParams }: PageProps<"/w/[workspaceSlug]/inbox">) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const filter = sp.view === "all" ? "all" : "open";
  const items = await listInbox(ctx, filter);

  return (
    <>
      <PageHeader title="Inbox" description="Approvals, alerts and reminders addressed to you. Every item says why it's here and links to the next action." actions={<InboxBulk slug={ctx.workspaceSlug} />} />
      <div className="space-y-6">
        {can(ctx, "automation.view") && <ApprovalsPanel ctx={ctx} empty={false} />}
        <Panel
          title="Notifications"
          action={
            <div className="flex gap-3 text-[12.5px]">
              <Link href="?" className={filter === "open" ? "font-medium text-ink" : "text-muted"}>Open</Link>
              <Link href="?view=all" className={filter === "all" ? "font-medium text-ink" : "text-muted"}>All</Link>
            </div>
          }
        >
          {items.length ? (
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className={cn("flex items-start gap-3 px-4 py-3", i.resolvedAt && "opacity-60")}>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", !i.readAt ? (i.severity === "critical" ? "bg-bad" : i.severity === "warning" ? "bg-warn" : "bg-cobalt") : "bg-line-strong")} aria-label={i.readAt ? "Read" : "Unread"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("font-medium", !i.readAt && "text-ink")}>{i.href ? <Link href={i.href} className="hover:text-cobalt">{i.title}</Link> : i.title}</span>
                      <Badge tone="outline">{i.sourceType}</Badge>
                    </div>
                    {i.body && <p className="mt-0.5 text-[13px] text-ink-2">{i.body}</p>}
                    <p className="mt-0.5 text-[12px] text-muted">{relativeTime(i.createdAt)}</p>
                  </div>
                  {!i.resolvedAt && <InboxButtons slug={ctx.workspaceSlug} id={i.id} />}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="Inbox zero">Renewals, overdue escalations, review reminders, integration failures and agent alerts arrive here once automations are set up.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
