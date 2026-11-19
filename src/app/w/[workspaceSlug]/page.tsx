import Link from "next/link";
import { ArrowRight, CircleCheck, Circle, Plus } from "lucide-react";
import { getWorkspaceCtx } from "@/server/context";
import { can } from "@/server/permissions";
import { attentionSignals, listProducts, type Signal } from "@/modules/portfolio/service";
import { listTasks } from "@/modules/work/service";
import { upcomingRenewals } from "@/modules/finance/service";
import { listActivity } from "@/modules/audit/service";
import { decisionsToRevisit } from "@/modules/knowledge/service";
import { listMembers } from "@/modules/identity/service";
import { LIFECYCLE_PHASES, label } from "@/modules/portfolio/constants";
import { taskLabel } from "@/modules/work/constants";
import { ActivityList } from "@/components/activity-list";
import { ApprovalsPanel } from "@/components/approvals";
import { RUN_TONE } from "@/components/agent-list";
import { seoSnapshot } from "@/modules/seo/service";
import { listAgents } from "@/modules/agents/service";
import { nextActions, portfolioPulse } from "@/modules/growth/service";
import { NextActionsPanel, PulseTable } from "@/components/growth-views";
import { Badge, EmptyState, HealthBadge, LifecycleBadge, PageHeader, Panel, ProductMark, Stat } from "@/components/ui";
import { daysUntil, formatDate, money, today } from "@/lib/format";

export const metadata = { title: "Command center" };

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export default async function CommandCenter({ params }: PageProps<"/w/[workspaceSlug]">) {
  const { workspaceSlug } = await params;
  const ctx = await getWorkspaceCtx(workspaceSlug);
  const base = `/w/${ctx.workspaceSlug}`;
  const canProducts = can(ctx, "product.view");
  const canWork = can(ctx, "work.view");
  const canFinance = can(ctx, "finance.view");
  const canAudit = can(ctx, "audit.view");
  const canDocs = can(ctx, "docs.view");

  const [products, signals, myTasks, overdue, openTasks, renewals, activity, revisit, members] = await Promise.all([
    canProducts ? listProducts(ctx) : [],
    canProducts ? attentionSignals(ctx) : new Map<string, Signal[]>(),
    canWork ? listTasks(ctx, { assigneeId: "me", status: "open" }) : [],
    canWork ? listTasks(ctx, { status: "open", overdue: true }) : [],
    canWork ? listTasks(ctx, { status: "open" }) : [],
    canFinance ? upcomingRenewals(ctx, 30) : [],
    canAudit ? listActivity(ctx, { limit: 8 }).then((r) => r.items) : [],
    canDocs ? decisionsToRevisit(ctx) : [],
    can(ctx, "members.view") ? listMembers(ctx) : [],
  ]);
  const [seo, agents] = await Promise.all([
    can(ctx, "seo.view") ? seoSnapshot(ctx) : Promise.resolve({ overviews: [], openInsights: 0 } as unknown as Awaited<ReturnType<typeof seoSnapshot>>),
    can(ctx, "agent.view") ? listAgents(ctx) : Promise.resolve([]),
  ]);
  const pulse = await portfolioPulse(ctx);
  const actions = await nextActions(ctx, pulse);
  const growthConnected = pulse.some((r) => r.search || r.traffic);

  const attention = products
    .map((p) => ({ p, s: (signals.get(p.id) ?? []).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) }))
    .filter((x) => x.s.length)
    .sort((a, b) => SEVERITY_RANK[a.s[0]!.severity] - SEVERITY_RANK[b.s[0]!.severity] || a.p.priority.localeCompare(b.p.priority));
  const focus = products.filter((p) => p.focus === "current_focus" || p.pinned);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const checklist = [
    { done: products.length > 0, label: "Add your first product", href: `${base}/products/new` },
    { done: openTasks.length > 0 || myTasks.length > 0, label: "Create a task for something you're working on", href: `${base}/work?new=1` },
    { done: products.some((p) => p.health !== "unknown"), label: "Give a product a health assessment", href: products[0] ? `${base}/products/${products[0].slug}/settings` : `${base}/products/new` },
    ...(canFinance ? [{ done: renewals.length > 0, label: "Log a cost or renewal (hosting, domain, API)", href: `${base}/finance` }] : []),
    ...(can(ctx, "integration.manage") ? [{ done: growthConnected, label: "Connect Google Analytics or Search Console", href: `${base}/integrations` }] : []),
    ...(can(ctx, "content.publish") ? [{ done: pulse.some((r) => (r.content?.published ?? 0) > 0), label: "Publish a first blog post", href: `${base}/content/new` }] : []),
    ...(can(ctx, "members.manage") ? [{ done: members.length > 1, label: "Invite a teammate or co-founder", href: `${base}/settings#members` }] : []),
  ];
  const setupDone = checklist.every((c) => c.done);

  return (
    <>
      <PageHeader
        eyebrow={`${greeting}, ${ctx.user.name.split(" ")[0]} · ${formatDate(today(), { weekday: "long", month: "long", day: "numeric" })}`}
        title="Command center"
        description={`What needs you across ${ctx.workspace.name}.`}
        actions={
          <>
            {canWork && <Link href={`${base}/work?new=1`} className="btn btn-secondary"><Plus className="size-4" /> Task</Link>}
            {can(ctx, "product.create") && <Link href={`${base}/products/new`} className="btn btn-primary"><Plus className="size-4" /> Product</Link>}
          </>
        }
      />

      {!setupDone && (
        <Panel title="Get set up" className="mb-6" action={<span className="text-[12.5px] text-muted">{checklist.filter((c) => c.done).length} of {checklist.length} done</span>}>
          <ul className="grid sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label} className="border-b border-line last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2):nth-child(odd)]:border-b-0">
                <Link href={c.href} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
                  {c.done ? <CircleCheck className="size-4 text-good" /> : <Circle className="size-4 text-muted" />}
                  <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active products" value={products.length} hint={`${focus.length} in focus`} href={`${base}/products`} />
        <Stat label="Need attention" value={attention.length} hint={attention.length ? "See list below" : "All clear"} />
        <Stat label="Open tasks" value={canWork ? openTasks.length : "—"} hint={canWork ? `${overdue.length} overdue` : "No access"} href={canWork ? `${base}/work` : undefined} />
        {canFinance ? (
          <Stat label="Renewals · 30 days" value={renewals.length} hint={renewals[0] ? `Next: ${renewals[0].vendor}` : "None scheduled"} href={`${base}/finance`} />
        ) : (
          <Stat label="Decisions to revisit" value={revisit.length} href={`${base}/docs`} />
        )}
      </div>

      {products.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          {LIFECYCLE_PHASES.map((phase) => {
            const inPhase = products.filter((p) => phase.stages.includes(p.lifecycle));
            return (
              <div key={phase.name} className="bg-surface px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow">{phase.name}</span>
                  <span className="font-serif text-xl">{inPhase.length}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {inPhase.slice(0, 6).map((p) => (
                    <Link key={p.id} href={`${base}/products/${p.slug}`} title={`${p.name} · ${label(p.lifecycle)}`}>
                      <ProductMark name={p.name} color={p.brandColor} className="size-6 text-[11px]" />
                    </Link>
                  ))}
                  {inPhase.length > 6 && <span className="text-[12px] text-muted">+{inPhase.length - 6}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <NextActionsPanel actions={actions} />

          {pulse.length > 0 && (
            <Panel title="Portfolio pulse" action={<Link href={`${base}/growth`} className="link text-[12.5px]">Growth</Link>}>
              <PulseTable slug={ctx.workspaceSlug} rows={pulse} />
            </Panel>
          )}

          <Panel title="Needs attention" action={<span className="text-[12px] text-muted">Rule-based · from your records</span>}>
            {attention.length ? (
              <ul className="divide-y divide-line">
                {attention.slice(0, 8).map(({ p, s }) => (
                  <li key={p.id}>
                    <Link href={`${base}/products/${p.slug}`} className="flex items-start gap-3 px-4 py-3 hover:bg-sunken/60">
                      <ProductMark name={p.name} color={p.brandColor} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          <Badge tone={p.priority === "p0" ? "bad" : p.priority === "p1" ? "warn" : "neutral"}>{p.priority.toUpperCase()}</Badge>
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {s.map((sig) => (
                            <li key={sig.kind + sig.label} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                              <span className={`size-1.5 rounded-full ${sig.severity === "high" ? "bg-bad" : sig.severity === "medium" ? "bg-warn" : "bg-muted"}`} />
                              {sig.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <ArrowRight className="mt-1 size-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title={products.length ? "Nothing needs attention" : "No products yet"}>
                {products.length
                  ? "No overdue work, urgent bugs, missed reviews or imminent renewals."
                  : "Add a product and this list will flag overdue work, urgent bugs, missing owners and upcoming renewals."}
              </EmptyState>
            )}
          </Panel>

          {focus.length > 0 && (
            <Panel title="In focus">
              <ul className="divide-y divide-line">
                {focus.map((p) => (
                  <li key={p.id}>
                    <Link href={`${base}/products/${p.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken/60">
                      <ProductMark name={p.name} color={p.brandColor} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{p.name}</div>
                        <div className="truncate text-[12.5px] text-muted">{p.summary || label(p.type)}</div>
                      </div>
                      <LifecycleBadge lifecycle={p.lifecycle} />
                      <HealthBadge health={p.health} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {canAudit && (
            <Panel title="Recent activity" action={<Link href={`${base}/activity`} className="link text-[12.5px]">All activity</Link>}>
              <ActivityList items={activity} slug={ctx.workspaceSlug} />
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {can(ctx, "automation.view") && <ApprovalsPanel ctx={ctx} empty={false} />}
          {can(ctx, "seo.view") && seo.overviews.length > 0 && (
            <Panel title="Search · last 28 days" action={<Link href={`${base}/seo`} className="link text-[12.5px]">SEO</Link>}>
              <ul className="divide-y divide-line">
                {seo.overviews.map((o) => o.current && (
                  <li key={o.resource.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{o.resource.name}</span>
                    <span className="tabular-nums">{o.current.clicks.toLocaleString()} clicks</span>
                    {o.previous && o.previous.clicks > 0 && (
                      <span className={o.current.clicks >= o.previous.clicks ? "text-good" : "text-bad"}>
                        {o.current.clicks >= o.previous.clicks ? "+" : ""}{Math.round(((o.current.clicks - o.previous.clicks) / o.previous.clicks) * 100)}%
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="px-4 pb-3 text-[11.5px] text-muted">Google Search Console · {seo.openInsights} open opportunit{seo.openInsights === 1 ? "y" : "ies"}</p>
            </Panel>
          )}
          {can(ctx, "agent.view") && agents.length > 0 && (
            <Panel title="Agents" action={<Link href={`${base}/agents`} className="link text-[12.5px]">Operations</Link>}>
              <ul className="divide-y divide-line">
                {agents.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link href={a.lastRun ? `${base}/agents/runs/${a.lastRun.id}` : `${base}/agents/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-sunken/60">
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      {a.lastRun ? <Badge tone={RUN_TONE[a.lastRun.status] ?? "outline"}>{a.lastRun.status.replace(/_/g, " ")}</Badge> : <span className="text-muted">never run</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {canWork && (
            <Panel title="My work" action={<Link href={`${base}/work?assignee=me`} className="link text-[12.5px]">View all</Link>}>
              {myTasks.length ? (
                <ul className="divide-y divide-line">
                  {myTasks.slice(0, 8).map((t) => {
                    const late = t.dueDate && t.dueDate < today();
                    return (
                      <li key={t.id}>
                        <Link href={`${base}/work/${t.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/60">
                          <span className="font-mono text-[11.5px] text-muted">#{t.number}</span>
                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          {t.dueDate && (
                            <span className={`shrink-0 text-[12px] ${late ? "font-medium text-bad" : "text-muted"}`}>
                              {late ? `${-daysUntil(t.dueDate)}d late` : formatDate(t.dueDate, { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <Badge tone={t.status === "in_progress" ? "cobalt" : "neutral"}>{taskLabel(t.status)}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState compact title="Nothing assigned to you">Tasks assigned to you show up here, soonest due first.</EmptyState>
              )}
            </Panel>
          )}

          {canFinance && (
            <Panel title="Upcoming renewals" action={<Link href={`${base}/finance`} className="link text-[12.5px]">Finance</Link>}>
              {renewals.length ? (
                <ul className="divide-y divide-line">
                  {renewals.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.vendor}</div>
                        <div className="text-[12px] text-muted">{r.productName ?? "Shared"}</div>
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums">{money(r.amountMinor, r.currency)}</div>
                        <div className="text-[12px] text-muted">
                          {daysUntil(r.nextRenewalDate!) === 0 ? "today" : `in ${daysUntil(r.nextRenewalDate!)}d`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="No renewals in the next 30 days">Add subscriptions with a renewal date to get early warning here.</EmptyState>
              )}
            </Panel>
          )}

          {revisit.length > 0 && (
            <Panel title="Decisions to revisit">
              <ul className="divide-y divide-line">
                {revisit.map((d) => (
                  <li key={d.id}>
                    <Link href={`${base}/docs/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/60">
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      <span className="text-[12px] text-muted">due {formatDate(d.revisitDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
