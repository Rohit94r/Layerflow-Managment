import Link from "next/link";
import type { AgentView } from "@/modules/agents/service";
import { Badge, EmptyState } from "@/components/ui";
import { relativeTime } from "@/lib/format";

export const RUN_TONE: Record<string, "good" | "bad" | "cobalt" | "warn" | "outline"> = {
  succeeded: "good", failed: "bad", timed_out: "bad", running: "cobalt", queued: "cobalt", waiting_for_approval: "warn", cancelled: "outline",
};

export function AgentList({ slug, agents }: { slug: string; agents: AgentView[] }) {
  if (!agents.length) return <EmptyState compact title="No agents installed">Install one from the catalog. Each agent has an owner, a scope, a budget and only the tools you allow.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[760px]">
        <thead><tr><th>Agent</th><th>Scope</th><th>Owner</th><th>Status</th><th>Last run</th><th>Next</th><th className="text-right">Cost (month)</th></tr></thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id}>
              <td>
                <Link href={`/w/${slug}/agents/${a.id}`} className="font-medium hover:text-cobalt">{a.name}</Link>
                <div className="text-[12px] text-muted">{a.definition?.name} v{a.agentVersion}</div>
              </td>
              <td className="text-[13px]">{a.productName ?? "Workspace"}</td>
              <td className="text-[13px]">{a.ownerName ?? "—"}</td>
              <td>
                <Badge tone={a.status === "active" ? "good" : "outline"}>{a.status}</Badge>
                {a.stats.active > 0 && <Badge tone="cobalt" className="ml-1">running</Badge>}
              </td>
              <td className="text-[13px]">
                {a.lastRun ? (
                  <Link href={`/w/${slug}/agents/runs/${a.lastRun.id}`} className="flex items-center gap-1.5 hover:text-cobalt">
                    <Badge tone={RUN_TONE[a.lastRun.status] ?? "outline"}>{a.lastRun.status.replace(/_/g, " ")}</Badge>
                    <span className="text-muted">{relativeTime(a.lastRun.startedAt)}</span>
                  </Link>
                ) : <span className="text-muted">Never</span>}
              </td>
              <td className="text-[13px] text-muted">{a.schedule === "manual" ? "Manual" : a.schedule}</td>
              <td className="text-right text-[13px] tabular-nums">
                ${(a.stats.monthCost / 1e6).toFixed(2)} <span className="text-muted">/ ${(a.monthlyBudgetCents / 100).toFixed(0)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
