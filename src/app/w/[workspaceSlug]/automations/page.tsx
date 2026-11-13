import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { listAutomations, templates } from "@/modules/automation/service";
import { productOptions } from "@/modules/portfolio/service";
import { ApprovalsPanel } from "@/components/approvals";
import { AddAutomation } from "@/components/client/automation-form";
import { AutomationButtons, KillSwitch } from "@/components/client/ops-actions";
import { Badge, EmptyState, NoAccess, PageHeader, Panel } from "@/components/ui";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Automations" };

export default async function AutomationsPage({ params }: PageProps<"/w/[workspaceSlug]/automations">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  if (!can(ctx, "automation.view")) return <NoAccess what="automations" />;
  const canManage = can(ctx, "automation.manage");
  const [autos, products] = await Promise.all([listAutomations(ctx), productOptions(ctx)]);
  const paused = ctx.workspace.automationsPaused;
  const cronReady = Boolean(process.env.CRON_SECRET);

  return (
    <>
      <PageHeader
        title="Automations"
        description="Trigger → conditions → action → approval → audit. Every run is recorded, deduplicated and can be dry-run first."
        actions={canManage ? <KillSwitch slug={ctx.workspaceSlug} kind="automations" paused={paused} /> : undefined}
      />
      {paused && <p className="mb-5 rounded-md border border-bad/40 bg-bad-soft px-4 py-2.5 text-[13.5px] text-bad">The kill switch is on: no automation will act until it&apos;s resumed. Dry runs still work.</p>}
      {!cronReady && (
        <p className="mb-5 rounded-md border border-warn/40 bg-warn-soft/60 px-4 py-2.5 text-[13px] text-warn">
          Scheduled runs need <code className="font-mono">CRON_SECRET</code> set and a cron hitting <code className="font-mono">/api/cron</code> (vercel.json includes a daily schedule). Until then, use Run now.
        </p>
      )}
      <div className="space-y-6">
        <ApprovalsPanel ctx={ctx} empty={false} />
        <Panel title="Active automations" action={<span className="text-[12px] text-muted">{autos.length}</span>}>
          {autos.length ? (
            <ul className="divide-y divide-line">
              {autos.map((a) => (
                <li key={a.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        <Badge tone={a.status === "active" ? "good" : "outline"}>{a.status}</Badge>
                        {a.requiresApproval && <Badge tone="cobalt">approval required</Badge>}
                        <span className="text-[12px] text-muted">{a.productName ?? "All products"} · v{a.version}</span>
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-muted">
                        {templates().find((t) => t.key === a.template)?.trigger}
                        {Object.keys(a.params).length > 0 && ` · ${Object.entries(a.params).map(([k, v]) => `${k}: ${v}`).join(", ")}`}
                        {` · last run ${a.lastRunAt ? relativeTime(a.lastRunAt) : "never"}`}
                      </div>
                    </div>
                    <AutomationButtons slug={ctx.workspaceSlug} id={a.id} status={a.status} canManage={canManage} />
                  </div>
                  {a.runs.length > 0 && (
                    <details className="mt-2 text-[12.5px]">
                      <summary className="cursor-pointer text-ink-2">Run history ({a.runs.length})</summary>
                      <ul className="mt-2 space-y-2">
                        {a.runs.map((r) => (
                          <li key={r.id} className="rounded-md border border-line bg-bg px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={r.status === "succeeded" ? "good" : r.status === "failed" ? "bad" : r.status === "dry_run" ? "cobalt" : "outline"}>{r.status.replace("_", " ")}</Badge>
                              <span className="text-muted">{r.trigger} · {relativeTime(r.startedAt)}</span>
                              <span>{r.summary}</span>
                              {r.error && <span className="text-bad">{r.error}</span>}
                            </div>
                            {r.actionsTaken.length > 0 && (
                              <ul className="mt-1 list-disc pl-5 text-ink-2">
                                {r.actionsTaken.slice(0, 10).map((x, i) => <li key={i}>{x.action} → {x.target}: {x.result}</li>)}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No automations yet">Add one from the templates below. Start with renewal reminders and the weekly digest.</EmptyState>
          )}
        </Panel>

        <div>
          <h2 className="mb-3 text-xl">Templates</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {templates().map((t) => (
              <div key={t.key} className="panel flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-serif text-lg leading-tight">{t.name}</div>
                  {canManage && <AddAutomation slug={ctx.workspaceSlug} t={t} products={products} />}
                </div>
                <p className="mt-1 text-[13px] text-ink-2">{t.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                  <Badge tone="outline">{t.trigger}</Badge>
                  <Badge tone="neutral">{t.actionLabel}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
