import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { getAgent, getRun } from "@/modules/agents/service";
import { AutoRefresh } from "@/components/client/auto-refresh";
import { CancelRunButton } from "@/components/client/ops-actions";
import { RUN_TONE } from "@/components/agent-list";
import { Markdown } from "@/components/markdown";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { cn } from "@/lib/format";

export default async function RunPage({ params }: PageProps<"/w/[workspaceSlug]/agents/runs/[runId]">) {
  const { workspaceSlug, runId } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "agent.view")) notFound();
  const run = await getRun(ctx, runId);
  if (!run) notFound();
  const agent = await getAgent(ctx, run.instanceId);
  const live = run.status === "queued" || run.status === "running";
  const elapsed = Math.round(((run.finishedAt ?? new Date()).getTime() - run.startedAt.getTime()) / 1000);

  return (
    <>
      <AutoRefresh active={live} />
      <PageHeader
        eyebrow={<><Link href={`/w/${ctx.workspaceSlug}/agents`} className="hover:text-cobalt">Agents</Link> / <Link href={`/w/${ctx.workspaceSlug}/agents/${run.instanceId}`} className="hover:text-cobalt">{agent?.name ?? "Agent"}</Link></>}
        title={<span className="flex items-center gap-3">Run <Badge tone={RUN_TONE[run.status] ?? "outline"}>{run.status.replace(/_/g, " ")}</Badge></span>}
        description={`${run.trigger} · started ${run.startedAt.toLocaleString()} · ${elapsed}s · correlation id ${run.id}`}
        actions={live && can(ctx, "agent.run") ? <CancelRunButton slug={ctx.workspaceSlug} runId={run.id} /> : undefined}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Now", live ? (run.currentStep ?? "Starting") : "Finished"],
          ["Model", run.model ?? "—"],
          ["Tokens", (run.inputTokens + run.outputTokens).toLocaleString()],
          ["Cost (est.)", `$${(run.costMicros / 1e6).toFixed(4)}`],
        ].map(([k, v]) => (
          <div key={k} className="panel px-4 py-3">
            <div className="eyebrow">{k}</div>
            <div className="mt-1 flex items-center gap-2 truncate text-[15px]">
              {k === "Now" && live && <Loader2 className="size-4 animate-spin text-cobalt" />}
              {v}
            </div>
          </div>
        ))}
      </div>
      {run.error && <p className="mb-6 rounded-md border border-bad/40 bg-bad-soft px-4 py-2.5 text-[13.5px] text-bad">{run.error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Timeline" action={<span className="text-[12px] text-muted">Action summaries and tool calls · no hidden reasoning</span>}>
          <ol className="divide-y divide-line">
            {run.steps.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("size-2 rounded-full", s.status === "ok" ? "bg-good" : s.status === "pending" ? "bg-warn" : s.status === "denied" || s.status === "error" ? "bg-bad" : "bg-cobalt")} />
                  <Badge tone="outline">{s.kind.replace("_", " ")}</Badge>
                  <code className="font-mono text-[12px]">{s.name}</code>
                  <span className="ml-auto text-[11.5px] text-muted">{s.createdAt.toLocaleTimeString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{s.summary}</p>
                {(s.input != null || s.output != null) && (
                  <details className="mt-1 text-[12px]">
                    <summary className="cursor-pointer text-muted">Inputs & outputs (redacted)</summary>
                    {s.input != null && <pre className="mt-1 max-h-40 overflow-auto rounded bg-sunken p-2 font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(s.input, null, 2)}</pre>}
                    {s.output != null && <pre className="mt-1 max-h-60 overflow-auto rounded bg-sunken p-2 font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(s.output, null, 2)}</pre>}
                  </details>
                )}
              </li>
            ))}
            {!run.steps.length && <li className="px-4 py-5 text-[13px] text-muted">{live ? "Waiting for the first step…" : "No steps recorded."}</li>}
          </ol>
        </Panel>
        <Panel title="Output">
          <div className="px-5 py-4">
            {run.output ? <Markdown source={run.output} /> : <p className="text-muted">{live ? "The agent is working…" : "No output."}</p>}
            <p className="mt-4 text-[12px] text-muted">Reports the agent saved appear under Docs &amp; decisions as drafts. Proposed tasks wait in the approvals queue.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
