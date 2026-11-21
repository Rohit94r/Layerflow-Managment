import Link from "next/link";
import { loadProductPage } from "@/server/product-page";
import { can } from "@/server/permissions";
import { listPeople } from "@/modules/identity/service";
import { attentionSignals } from "@/modules/portfolio/service";
import { listTasks } from "@/modules/work/service";
import { listActivity } from "@/modules/audit/service";
import { listDocs } from "@/modules/knowledge/service";
import { label } from "@/modules/portfolio/constants";
import { docLabel } from "@/modules/knowledge/constants";
import { taskLabel } from "@/modules/work/constants";
import { hasVercelConnection, productDeployments } from "@/modules/deploys/service";
import { ActivityList } from "@/components/activity-list";
import { DeploymentsPanel } from "@/components/deployments-panel";
import { ClassificationEditor, LinkManager } from "@/components/client/product-panels";
import { Badge, LifecycleBadge, Panel, Stat } from "@/components/ui";
import { formatDate, relativeTime, today } from "@/lib/format";

export default async function ProductOverview({ params }: PageProps<"/w/[workspaceSlug]/products/[productSlug]">) {
  const { workspaceSlug, productSlug } = await params;
  const { ctx, product: p, base } = await loadProductPage(workspaceSlug, productSlug);
  const slug = ctx.workspaceSlug;
  const canWork = can(ctx, "work.view");
  const canSeeDeploys = can(ctx, "integration.view");

  const [people, signals, open, done, activity, docs, deploys, vercelConnected] = await Promise.all([
    listPeople(ctx),
    attentionSignals(ctx),
    canWork ? listTasks(ctx, { productId: p.id, status: "open" }) : [],
    canWork ? listTasks(ctx, { productId: p.id, status: "done" }) : [],
    can(ctx, "audit.view") ? listActivity(ctx, { productId: p.id, limit: 8 }).then((r) => r.items) : [],
    can(ctx, "docs.view") ? listDocs(ctx, { productId: p.id }) : [],
    canSeeDeploys ? productDeployments(ctx, p.id) : [],
    canSeeDeploys ? hasVercelConnection(ctx) : false,
  ]);
  const sigs = signals.get(p.id) ?? [];
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today());
  const bugs = open.filter((t) => t.type === "bug");

  const facts: [string, React.ReactNode][] = [
    ["Objective", p.strategicObjective],
    ["Audience", p.targetAudience],
    ["Business model", p.businessModel],
    ["Tech stack", p.techStack.length ? p.techStack.join(" · ") : ""],
    ["Tags", p.tags.length ? <span className="flex flex-wrap gap-1">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : ""],
    ["Launched", p.launchDate ? formatDate(p.launchDate) : ""],
    ["Next review", p.nextReviewDate ? <span className={p.nextReviewDate < today() ? "text-bad" : ""}>{formatDate(p.nextReviewDate)}</span> : ""],
    ["Health note", p.healthReason ? <>{p.healthReason}{p.healthUpdatedAt && <span className="text-muted"> · {relativeTime(p.healthUpdatedAt)}</span>}</> : ""],
  ];
  const filled = facts.filter(([, v]) => v);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {sigs.length > 0 && (
          <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-4 py-3">
            <div className="eyebrow mb-1.5 text-warn">Needs attention</div>
            <ul className="space-y-1">
              {sigs.map((s) => (
                <li key={s.kind + s.label} className="flex items-center gap-2 text-[13.5px] text-ink">
                  <span className={`size-1.5 rounded-full ${s.severity === "high" ? "bg-bad" : s.severity === "medium" ? "bg-warn" : "bg-muted"}`} />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canWork && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Open work" value={open.length} href={`${base}/work`} />
            <Stat label="Overdue" value={overdue.length} href={`${base}/work`} />
            <Stat label="Open bugs" value={bugs.length} hint={`${done.length} done all-time`} href={`${base}/work`} />
          </div>
        )}

        <Panel title="About" action={can(ctx, "product.edit") ? <Link href={`${base}/settings`} className="link text-[12.5px]">Edit</Link> : undefined}>
          {filled.length || p.description ? (
            <div className="px-4 py-3">
              {filled.length > 0 && (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
                  {filled.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[13px] text-muted">{k}</dt>
                      <dd className="text-[13.5px]">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {p.description && <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-ink-2">{p.description}</p>}
            </div>
          ) : (
            <p className="px-4 py-5 text-muted">
              No details yet. {can(ctx, "product.edit") && <Link href={`${base}/settings`} className="link">Add the objective, audience and stack</Link>}
            </p>
          )}
        </Panel>

        {canWork && (
          <Panel title="Next up" action={<Link href={`${base}/work`} className="link text-[12.5px]">All work</Link>}>
            {open.length ? (
              <ul className="divide-y divide-line">
                {open.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link href={`/w/${slug}/work/${t.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/60">
                      <span className="font-mono text-[11.5px] text-muted">#{t.number}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.type === "bug" && <Badge tone="bad">Bug</Badge>}
                      <Badge tone={t.status === "in_progress" ? "cobalt" : "neutral"}>{taskLabel(t.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-muted">No open work. <Link href={`${base}/work`} className="link">Plan the next task</Link></p>
            )}
          </Panel>
        )}

        {can(ctx, "audit.view") && (
          <Panel title="Recent activity">
            <ActivityList items={activity} slug={slug} />
          </Panel>
        )}
      </div>

      <div className="space-y-6">
        {canSeeDeploys && (
          <DeploymentsPanel
            slug={slug}
            productId={p.id}
            projects={deploys}
            integrationsHref={`/w/${slug}/integrations`}
            canManage={can(ctx, "integration.manage") && !p.archivedAt}
            vercelConnected={vercelConnected}
          />
        )}
        <Panel title="Classification">
          <ClassificationEditor slug={slug} product={p} people={people} canEdit={can(ctx, "product.edit") && !p.archivedAt} />
        </Panel>
        <Panel title="Links">
          <LinkManager slug={slug} productId={p.id} links={p.links} canEdit={can(ctx, "product.edit")} />
        </Panel>
        {docs.length > 0 && (
          <Panel title="Docs" action={<Link href={`${base}/docs`} className="link text-[12.5px]">All</Link>}>
            <ul className="divide-y divide-line">
              {docs.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link href={`/w/${slug}/docs/${d.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-sunken/60">
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="text-[12px] text-muted">{docLabel(d.kind)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {p.children.length > 0 && (
          <Panel title="Sub-products">
            <ul className="divide-y divide-line">
              {p.children.map((c) => (
                <li key={c.id}>
                  <Link href={`/w/${slug}/products/${c.slug}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-sunken/60">
                    {c.name} <LifecycleBadge lifecycle={c.lifecycle} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <p className="px-1 text-[12px] text-muted">
          {label(p.type)} · created {formatDate(p.createdAt)} · updated {relativeTime(p.updatedAt)}
        </p>
      </div>
    </div>
  );
}
