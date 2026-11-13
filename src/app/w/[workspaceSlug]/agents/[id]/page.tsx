import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { catalog, getAgent } from "@/modules/agents/service";
import { listPeople } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { listActivity } from "@/modules/audit/service";
import { agentsConfigured } from "@/ai/catalog";
import { AgentConfigForm } from "@/components/client/agent-config";
import { AgentButtons } from "@/components/client/ops-actions";
import { ActivityList } from "@/components/activity-list";
import { RUN_TONE } from "@/components/agent-list";
import { Badge, PageHeader, Panel, Stat } from "@/components/ui";
import { relativeTime } from "@/lib/format";

export default async function AgentDetail({ params }: PageProps<"/w/[workspaceSlug]/agents/[id]">) {
  const { workspaceSlug, id } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "agent.view")) notFound();
  const a = await getAgent(ctx, id);
  if (!a) notFound();
  const def = catalog().find((c) => c.key === a.agentKey)!;
  const [products, people, history] = await Promise.all([productOptions(ctx), listPeople(ctx), can(ctx, "audit.view") ? listActivity(ctx, { targetId: id, limit: 30 }).then((r) => r.items) : []]);
  const done = a.runs.filter((r) => r.finishedAt);
  const durations = done.map((r) => r.finishedAt!.getTime() - r.startedAt.getTime()).sort((x, y) => x - y);
  const median = durations.length ? durations[Math.floor(durations.length / 2)]! : null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/w/${ctx.workspaceSlug}/agents`} className="hover:text-cobalt">Agents</Link>}
        title={a.name}
        description={`${def.name} v${a.agentVersion} · ${a.productName ? `scoped to ${a.productName}` : "workspace-wide"} · owned by ${a.ownerName ?? "—"} · config v${a.configVersion}`}
        actions={<AgentButtons slug={ctx.workspaceSlug} id={a.id} status={a.status} canManage={can(ctx, "agent.manage")} canRun={can(ctx, "agent.run")} runnable={agentsConfigured()} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Status" value={<span className="text-[1.3rem] capitalize">{a.status}</span>} hint={a.schedule === "manual" ? "Runs on demand" : `Runs ${a.schedule}`} />
        <Stat label="Runs" value={a.stats.runs} hint={`${a.stats.succeeded} succeeded · ${a.stats.failed} failed`} />
        <Stat label="Cost this month" value={`$${(a.stats.monthCost / 1e6).toFixed(2)}`} hint={`Cap $${(a.monthlyBudgetCents / 100).toFixed(2)} · estimated`} />
        <Stat label="Median duration" value={median ? `${Math.round(median / 1000)}s` : "—"} hint={a.lastRunAt ? `Last ${relativeTime(a.lastRunAt)}` : "Never run"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Panel title="Runs">
            {a.runs.length ? (
              <ul className="divide-y divide-line">
                {a.runs.map((r) => (
                  <li key={r.id}>
                    <Link href={`/w/${ctx.workspaceSlug}/agents/runs/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-sunken/60">
                      <Badge tone={RUN_TONE[r.status] ?? "outline"}>{r.status.replace(/_/g, " ")}</Badge>
                      <span className="text-[13px]">{r.trigger}{r.startedByName ? ` by ${r.startedByName}` : ""}</span>
                      <span className="text-[12px] text-muted">{relativeTime(r.startedAt)}</span>
                      <span className="ml-auto text-[12px] tabular-nums text-muted">{(r.inputTokens + r.outputTokens).toLocaleString()} tokens · ${(r.costMicros / 1e6).toFixed(3)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-5 text-[13px] text-muted">No runs yet.</p>}
          </Panel>
          {can(ctx, "audit.view") && (
            <Panel title="Configuration history">
              <ActivityList items={history} slug={ctx.workspaceSlug} emptyText="No changes recorded." />
            </Panel>
          )}
        </div>
        <Panel title="Configuration, tools & permissions">
          <AgentConfigForm
            slug={ctx.workspaceSlug} id={a.id} canEdit={can(ctx, "agent.manage")}
            v={{ name: a.name, productId: a.productId, ownerId: a.ownerId, instructions: a.instructions, schedule: a.schedule, monthlyBudgetCents: a.monthlyBudgetCents, allowedTools: a.allowedTools }}
            products={products} people={people} tools={def.tools} defaults={def.defaultTools}
          />
        </Panel>
      </div>
    </>
  );
}
