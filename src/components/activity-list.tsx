import Link from "next/link";
import type { ActivityItem } from "@/modules/audit/service";
import { relativeTime } from "@/lib/format";
import { label } from "@/modules/portfolio/constants";
import { taskLabel } from "@/modules/work/constants";

const VERBS: Record<string, string> = {
  "workspace.created": "created the workspace",
  "workspace.updated": "updated workspace settings",
  "member.joined": "joined the workspace",
  "member.left": "left the workspace",
  "member.removed": "removed",
  "member.role_changed": "changed the role of",
  "invitation.created": "invited",
  "invitation.revoked": "revoked the invitation for",
  "product.created": "created project",
  "product.updated": "updated",
  "product.archived": "archived",
  "product.restored": "restored",
  "product.deleted": "deleted project",
  "product.link_added": "added a link to",
  "product.link_removed": "removed a link",
  "group.created": "created group",
  "group.deleted": "deleted group",
  "task.created": "created",
  "task.updated": "updated",
  "task.status_changed": "moved",
  "task.deleted": "deleted",
  "task.commented": "commented on",
  "doc.created": "wrote",
  "doc.updated": "edited",
  "doc.deleted": "deleted doc",
  "expense.created": "added cost",
  "expense.updated": "updated cost",
  "expense.cancelled": "cancelled",
  "expense.reactivated": "reactivated",
  "expense.renewed": "marked renewed",
  "expense.deleted": "deleted cost",
  "revenue.recorded": "recorded revenue",
  "revenue.deleted": "deleted revenue",
  "content.created": "drafted post",
  "content.updated": "edited post",
  "content.in_review": "sent for review",
  "content.approved": "approved post",
  "content.draft": "moved back to draft",
  "content.archived": "archived post",
  "content.idea": "parked as an idea",
  "content.scheduled": "scheduled post",
  "content.published": "published",
  "content.unpublished": "unpublished",
  "content.deleted": "deleted post",
  "content.channel_updated": "changed publishing settings for",
  "content.webhook_secret_rotated": "rotated the webhook secret for",
  "integration.connected": "connected",
  "integration.reconnected": "reconnected",
  "integration.disconnected": "disconnected",
  "integration.resource_mapped": "mapped",
  "agent.installed": "installed agent",
  "agent.configured": "reconfigured agent",
  "agent.run_completed": "finished a run:",
  "automation.created": "created automation",
  "automation.ran": "ran automation",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "approval.failed": "approved, but execution failed:",
};

const pretty = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  const s = String(v);
  return label(s) !== s ? label(s) : taskLabel(s);
};

function describeChanges(changes: ActivityItem["changes"]) {
  if (!changes) return null;
  const keys = Object.keys(changes).filter((k) => !["updatedAt", "description", "body"].includes(k));
  if (!keys.length) return null;
  return keys
    .slice(0, 3)
    .map((k) => {
      const c = changes[k]!;
      const field = k.replace(/Id$/, "").replace(/([A-Z])/g, " $1").toLowerCase();
      if (k.endsWith("Id")) return `${field} changed`;
      return `${field}: ${pretty(c.from)} → ${pretty(c.to)}`;
    })
    .join(" · ");
}

export function ActivityList({ items, slug, emptyText = "Nothing has happened yet." }: { items: ActivityItem[]; slug: string; emptyText?: string }) {
  if (!items.length) return <p className="px-4 py-6 text-center text-muted">{emptyText}</p>;
  return (
    <ol className="divide-y divide-line">
      {items.map((e) => {
        const detail = describeChanges(e.changes);
        const href =
          e.targetType === "document" && e.action !== "doc.deleted" && e.targetId ? `/w/${slug}/docs/${e.targetId}`
          : e.targetType === "task" && e.action !== "task.deleted" ? `/w/${slug}/work/${e.targetLabel.match(/^#(\d+)/)?.[1] ?? ""}`
          : e.targetType === "content" && e.action !== "content.deleted" && e.targetId ? `/w/${slug}/content/${e.targetId}`
          : null;
        return (
          <li key={e.id} className="flex gap-3 px-4 py-2.5">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-cobalt" aria-hidden />
            <div className="min-w-0 flex-1 text-[13.5px]">
              <span className="font-medium text-ink">{e.actorType === "human" ? (e.actorName ?? "Someone") : e.actorType}</span>{" "}
              <span className="text-ink-2">{VERBS[e.action] ?? e.action}</span>{" "}
              {href ? (
                <Link href={href} className="link">{e.targetLabel}</Link>
              ) : (
                <span className="text-ink">{e.targetLabel}</span>
              )}
              {detail && <div className="mt-0.5 truncate text-[12px] text-muted">{detail}</div>}
            </div>
            <time className="shrink-0 text-[12px] text-muted" dateTime={e.createdAt.toISOString()} title={e.createdAt.toLocaleString()}>
              {relativeTime(e.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
