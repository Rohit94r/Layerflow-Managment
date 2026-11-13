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

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "layerflow-os/v1",
      workspace: { name: ctx.workspace.name, slug: ctx.workspace.slug, timezone: ctx.workspace.timezone, currency: ctx.workspace.currency },
      members, groups, products, links, tasks, comments, documents, expenses, revenue, audit,
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
