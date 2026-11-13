import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { actionCtx } from "@/server/context";
import { can } from "@/server/permissions";

/** Full JSON export of a workspace's data. Auth secrets and invitation token hashes are never included. */
export async function GET(_req: Request, { params }: RouteContext<"/api/w/[workspaceSlug]/export">) {
  const { workspaceSlug } = await params;
  const ctx = await actionCtx(workspaceSlug);
  if (!ctx) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!can(ctx, "data.export")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const w = ctx.workspaceId;
  const [members, products, links, groups, tasks, comments, documents, expenses, revenue, audit] = await Promise.all([
    db.select({ userId: schema.workspaceMember.userId, name: schema.user.name, email: schema.user.email, role: schema.workspaceMember.role, joinedAt: schema.workspaceMember.createdAt })
      .from(schema.workspaceMember).innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId)).where(eq(schema.workspaceMember.workspaceId, w)),
    db.select().from(schema.product).where(eq(schema.product.workspaceId, w)),
    db.select().from(schema.productLink).where(eq(schema.productLink.workspaceId, w)),
    db.select().from(schema.productGroup).where(eq(schema.productGroup.workspaceId, w)),
    db.select().from(schema.task).where(eq(schema.task.workspaceId, w)),
    db.select().from(schema.taskComment).where(eq(schema.taskComment.workspaceId, w)),
    db.select().from(schema.document).where(eq(schema.document.workspaceId, w)),
    can(ctx, "finance.view") ? db.select().from(schema.expense).where(eq(schema.expense.workspaceId, w)) : Promise.resolve([]),
    can(ctx, "finance.view") ? db.select().from(schema.revenueEntry).where(eq(schema.revenueEntry.workspaceId, w)) : Promise.resolve([]),
    db.select().from(schema.auditEvent).where(eq(schema.auditEvent.workspaceId, w)),
  ]);

  const [roadmap, goals, budgets, automations, automationRuns, approvals, agents, agentRuns, seoDaily, seoInsights, seoAudits, uptime, connections] = await Promise.all([
    db.select().from(schema.roadmapItem).where(eq(schema.roadmapItem.workspaceId, w)),
    db.select().from(schema.goal).where(eq(schema.goal.workspaceId, w)),
    db.select().from(schema.budget).where(eq(schema.budget.workspaceId, w)),
    db.select().from(schema.automation).where(eq(schema.automation.workspaceId, w)),
    db.select().from(schema.automationRun).where(eq(schema.automationRun.workspaceId, w)),
    db.select().from(schema.approval).where(eq(schema.approval.workspaceId, w)),
    db.select().from(schema.agentInstance).where(eq(schema.agentInstance.workspaceId, w)),
    db.select().from(schema.agentRun).where(eq(schema.agentRun.workspaceId, w)),
    db.select().from(schema.seoDaily).where(eq(schema.seoDaily.workspaceId, w)),
    db.select().from(schema.seoInsight).where(eq(schema.seoInsight.workspaceId, w)),
    db.select().from(schema.seoAudit).where(eq(schema.seoAudit.workspaceId, w)),
    db.select().from(schema.uptimeCheck).where(eq(schema.uptimeCheck.workspaceId, w)),
    // Connection metadata only: encrypted tokens are never exported.
    db.select({ id: schema.integrationConnection.id, provider: schema.integrationConnection.provider, account: schema.integrationConnection.accountLabel, scopes: schema.integrationConnection.scopes, status: schema.integrationConnection.status, createdAt: schema.integrationConnection.createdAt })
      .from(schema.integrationConnection).where(eq(schema.integrationConnection.workspaceId, w)),
  ]);

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "layerflow-os/v2",
      workspace: { name: ctx.workspace.name, slug: ctx.workspace.slug, timezone: ctx.workspace.timezone, currency: ctx.workspace.currency },
      members, groups, products, links, tasks, comments, documents, expenses, revenue, budgets, roadmap, goals,
      integrations: connections, seo: { daily: seoDaily, insights: seoInsights, audits: seoAudits, uptime },
      automations, automationRuns, approvals, agents, agentRuns, audit,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${ctx.workspaceSlug}-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
