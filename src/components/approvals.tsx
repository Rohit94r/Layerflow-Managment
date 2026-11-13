import type { Ctx } from "@/server/permissions";
import { can } from "@/server/permissions";
import { listApprovals } from "@/modules/automation/inbox";
import { ApprovalButtons } from "@/components/client/ops-actions";
import { Badge, Panel } from "@/components/ui";
import { relativeTime } from "@/lib/format";

/** Pending approvals with the exact payload that will execute. */
export async function ApprovalsPanel({ ctx, empty = true }: { ctx: Ctx; empty?: boolean }) {
  const items = await listApprovals(ctx, "pending");
  if (!items.length && !empty) return null;
  const canDecide = can(ctx, "approval.decide");
  return (
    <Panel title="Waiting for approval" action={<span className="text-[12px] text-muted">{items.length} pending</span>}>
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={a.requestedByType === "agent" ? "cobalt" : "neutral"}>{a.requestedByType}</Badge>
                  <span className="text-[12.5px] text-muted">{a.requestedByName} · {relativeTime(a.createdAt)}</span>
                  <Badge tone={a.risk === "high" ? "bad" : a.risk === "medium" ? "warn" : "outline"}>{a.risk} risk</Badge>
                </div>
                <div className="mt-1 font-medium">{a.summary}</div>
                <details className="mt-1 text-[12px]">
                  <summary className="cursor-pointer text-muted">Exact payload ({a.action})</summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-sunken p-2 font-mono text-[11.5px] whitespace-pre-wrap">{JSON.stringify(a.payload, null, 2)}</pre>
                </details>
                <div className="mt-0.5 text-[11.5px] text-muted">Expires {relativeTime(a.expiresAt).replace("ago", "from now")}</div>
              </div>
              {canDecide ? <ApprovalButtons slug={ctx.workspaceSlug} id={a.id} /> : <span className="text-[12px] text-muted">Needs a manager or admin</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-[13px] text-muted">Nothing waiting. Agents and automations that need a human decision queue here.</p>
      )}
    </Panel>
  );
}
