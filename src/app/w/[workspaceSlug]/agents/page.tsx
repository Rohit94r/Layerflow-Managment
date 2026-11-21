import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { catalog, listAgents } from "@/modules/agents/service";
import { listPeople } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { agentsConfigured, AGENT_MODEL } from "@/ai/catalog";
import { ApprovalsPanel } from "@/components/approvals";
import { AgentList } from "@/components/agent-list";
import { InstallAgent } from "@/components/client/agent-config";
import { KillSwitch } from "@/components/client/ops-actions";
import { Badge, NoAccess, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Agents" };

export default async function AgentsPage({ params }: PageProps<"/w/[workspaceSlug]/agents">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "agent.view")) return <NoAccess what="agents" />;
  const canManage = can(ctx, "agent.manage");
  const [agents, products, people] = await Promise.all([listAgents(ctx), productOptions(ctx), listPeople(ctx)]);
  const configured = agentsConfigured();
  const monthCost = agents.reduce((s, a) => s + a.stats.monthCost, 0);

  return (
    <>
      <PageHeader
        title="Agent operations"
        description="AI agents that work on your portfolio with an accountable owner, a scope, a budget and only the tools you allow. Consequential actions wait for approval; every step is visible."
        actions={canManage ? <KillSwitch slug={ctx.workspaceSlug} kind="agents" paused={ctx.workspace.agentsPaused} /> : undefined}
      />
      {ctx.workspace.agentsPaused && <p className="mb-5 rounded-md border border-bad/40 bg-bad-soft px-4 py-2.5 text-[13.5px] text-bad">The agent kill switch is on. No agent will start until it is resumed.</p>}
      {!configured && (
        <p className="mb-5 rounded-md border border-warn/40 bg-warn-soft/60 px-4 py-2.5 text-[13px] text-warn">
          Agents need <code className="font-mono">ANTHROPIC_API_KEY</code> on the server. You can install and configure them now; runs start once the key is set. Model: <code className="font-mono">{AGENT_MODEL()}</code>.
        </p>
      )}
      <div className="space-y-6">
        <ApprovalsPanel ctx={ctx} empty={false} />
        <Panel title="Installed agents" action={<span className="text-[12px] text-muted">${(monthCost / 1e6).toFixed(2)} this month · estimated from token usage</span>}>
          <AgentList slug={ctx.workspaceSlug} agents={agents} />
        </Panel>
        <div>
          <h2 className="mb-3 text-xl">Catalog</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {catalog().map((a) => (
              <div key={a.key} className="panel flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-serif text-lg leading-tight">{a.name}</div>
                    <div className="text-[12px] text-muted">{a.publisher} · v{a.version}</div>
                  </div>
                  {canManage && <InstallAgent slug={ctx.workspaceSlug} agentKey={a.key} name={a.name} products={products} people={people} tools={a.tools} defaults={a.defaultTools} schedule={a.suggestedSchedule} />}
                </div>
                <p className="mt-2 text-ink-2">{a.summary}</p>
                <p className="mt-2 text-[12.5px] text-ink-2"><span className="text-muted">Use case:</span> {a.useCase}</p>
                <p className="mt-1 text-[12.5px] text-ink-2"><span className="text-muted">Data access:</span> {a.dataAccess}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.tools.map((t) => <Badge key={t.name} tone={t.level === "approval" ? "warn" : t.level === "create_internal" ? "cobalt" : "outline"}>{t.name}</Badge>)}
                </div>
                <p className="mt-2 text-[11.5px] text-muted">Pricing: model usage billed to your Anthropic account; each install has its own monthly cap.</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
